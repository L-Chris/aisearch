import { Page, Searcher } from './searcher'
import { Browser } from './browser'
import { getErrorMessage, getUUID } from './utils'
import { PROMPT } from './prompts'
import fs from 'fs'
import path from 'path'
import { Query, QueryBuilder } from './query-builder'
import { LLMPool } from './llm-pool'
import { Config, defaultConfig } from './config'
import { Timer } from './utils'

class SearchGraph {
  private nodes: Map<string, Node>
  private edges: Map<string, Edge[]>
  private llmPool: LLMPool
  private proxy?: string
  private searchEngine: 'bing' | 'baidu'
  private logDir: string
  private queryBuilder: QueryBuilder
  private timer: Timer

  constructor (config: Config = defaultConfig) {
    this.nodes = new Map()
    this.edges = new Map()
    this.llmPool = new LLMPool(config)
    this.queryBuilder = new QueryBuilder(this.llmPool)
    this.proxy = config.proxy
    this.searchEngine = config.searchEngine || 'bing'
    this.logDir = path.join(process.cwd(), 'logs')
    // 确保日志目录存在
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true })
    }
    this.timer = new Timer()
  }

  private logAndSave (type: string, data: any) {
    const timestamp = new Date().getTime()
    const logFile = path.join(this.logDir, `${type}_${timestamp}.json`)
    fs.writeFileSync(logFile, JSON.stringify(data, null, 2))
    console.log(`[${type}] Saved to ${logFile}`)
  }

  async plan (content: string) {
    this.timer.start('total')
    this.timer.start('planning')
    console.log('\n[Plan] Starting with question:', content)
    try {
      // LLM planning
      this.timer.start('llm_planning')
      const res = await this.llmPool
        .next()
        .generate(`${PROMPT.PLAN}\n## 问题\n${content}\n`, 'json_object')
      this.timer.end('llm_planning')

      console.log('[Plan] LLM Response:', res)
      this.logAndSave('plan_llm_response', { question: content, response: res })

      const qs = JSON.parse(res)
      const nodes = Array.isArray(qs?.nodes) ? (qs.nodes as RawNode[]) : []
      console.log(
        '[Plan] Parsed nodes structure:',
        JSON.stringify(nodes, null, 2)
      )

      const root = this.addRootNode(content)
      console.log('[Plan] Root node created:', root.id)

      this.timer.start('process_nodes')
      await this.processNodes(nodes, root.id)
      this.timer.end('process_nodes')

      this.timer.start('process_root')
      await this.processRootNode(root.id)
      this.timer.end('process_root')

      this.timer.end('total')

      // Save timing metrics
      this.logAndSave('timing_metrics', {
        question: content,
        metrics: this.timer.getMetrics()
      })

      // 保存最终的搜索图结构
      this.logAndSave('final_search_graph', {
        nodes: Array.from(this.nodes.entries()),
        edges: Array.from(this.edges.entries())
      })

      return {
        nodes: this.nodes,
        edges: this.edges,
        answer: root.answer || '',
        timing: this.timer.getMetrics()
      }
    } catch (error) {
      this.timer.end('total')
      console.error(`[Plan] Error:`, error)
      this.logAndSave('plan_error', {
        error: getErrorMessage(error),
        question: content
      })
      return {
        nodes: new Map(),
        edges: new Map(),
        answer: '',
        timing: this.timer.getMetrics()
      }
    } finally {
      // 确保关闭浏览器实例
      await Browser.close()
    }
  }

  private async processNodes (nodes: RawNode[], parentId: string) {
    console.log(
      `\n[ProcessNodes] Processing ${nodes.length} nodes for parent:`,
      parentId
    )

    // 然后串行处理每个子节点
    for (const node of nodes) {
      console.log(`[ProcessNodes] Creating node for content:`, node.content)
      const newNode = this.addNode(node.content, parentId)

      console.log(`[ProcessNodes] Executing node ${newNode.id}`)
      await this.executeNode(newNode.id)

      if (Array.isArray(node.children) && node.children.length > 0) {
        console.log(
          `[ProcessNodes] Node ${newNode.id} has ${node.children.length} children`
        )
        await this.processNodes(node.children, newNode.id)
      }
    }

    console.log(`[ProcessNodes] Completed all nodes for parent:`, parentId)
  }

  private addNode (nodeContent: string, parentId: string): Node {
    const node: Node = {
      id: getUUID(),
      content: nodeContent,
      type: 'searcher',
      state: NODE_STATE.NOT_STARTED,
      answer: '',
      pages: []
    }
    this.nodes.set(node.id, node)
    this.addEdge(parentId, node.id)
    return node
  }

  private async executeNode (nodeId: string) {
    const nodeTimer = new Timer()
    nodeTimer.start('node_execution')
    console.log(`\n[ExecuteNode] Starting execution for node:`, nodeId)
    const node = this.nodes.get(nodeId)
    if (!node) {
      console.error(`[ExecuteNode] Node ${nodeId} not found`)
      return
    }

    try {
      node.state = NODE_STATE.RUNNING
      // 获取所有祖先节点的问答信息
      const ancestors = this.getAllAncestors(nodeId)
      const ancestorResponses = ancestors
        .map(id => this.nodes.get(id))
        .filter((node): node is Node => !!node && !!node.answer)
        .map(node => ({
          content: node.content,
          answer: node.answer || ''
        }))
      let adjustedQuestion = node.content

      // 问题调整
      nodeTimer.start('question_adjustment')
      if (ancestorResponses.length > 0) {
        const adjustPrompt = `请根据以下上下文，调整问题的描述，使其更具体和明确，以便于搜索引擎理解和搜索。
## 注意
- 若原问题已经足够明确，不需要根据上下文调整，直接返回原问题即可
## 上下文信息
${ancestorResponses
  .map(r => `问题：${r.content}\n回答：${r.answer}`)
  .join('\n---\n')}
## 原始问题
${node.content}
## 返回格式
只返回调整后的问题，不需要任何解释。`
        adjustedQuestion = await this.llmPool.next().generate(adjustPrompt)
        console.log(
          `[ExecuteNode] Adjusted question from "${node.content}" to "${adjustedQuestion}"`
        )
        node.content = adjustedQuestion
      }
      nodeTimer.end('question_adjustment')

      // 尝试最多两次搜索
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          // 构建查询
          nodeTimer.start(`query_building_attempt_${attempt}`)
          const query = await this.queryBuilder.build(
            attempt === 1 ? node.content : `${node.content} 另一种表述`,
            attempt === 2 ? '请使用不同的关键词重新组织查询' : undefined
          )
          nodeTimer.end(`query_building_attempt_${attempt}`)

          // 执行搜索
          const searchText = query.commands 
            ? `${query.text} ${query.commands.join(' ')}`
            : query.text

          const searcher = new Searcher({ 
            proxy: this.proxy,
            searchEngine: query.platform || this.searchEngine // 使用查询指定的平台或默认平台
          })
          nodeTimer.start(`search_execution_attempt_${attempt}`)
          const response = await searcher.run(searchText, ancestorResponses)
          nodeTimer.end(`search_execution_attempt_${attempt}`)

          // 检查搜索结果是否有效
          if (
            response.pages.length > 0 &&
            response.answer &&
            !['没有找到相关链接', '未找到足够相关的网页内容'].includes(response.answer)
          ) {
            node.answer = response.answer
            node.pages = response.pages
            node.state = NODE_STATE.FINISHED
            node.queries = node.queries || []
            node.queries.push(query)

            // 记录成功的结果
            this.logAndSave(`node_${nodeId}_result`, {
              nodeId,
              attempt,
              originalContent: node.content,
              adjustedContent: adjustedQuestion,
              query,
              answer: node.answer,
              pages: node.pages,
              ancestorResponses
            })

            // 记录节点执行时间
            this.logAndSave(`node_${nodeId}_timing`, {
              nodeId,
              attempt,
              metrics: nodeTimer.getMetrics(),
              searchMetrics: response.timing
            })

            return // 成功找到答案，退出重试循环
          }

          // 如果是第一次尝试失败，记录失败信息并继续第二次尝试
          if (attempt === 1) {
            console.log(
              `[ExecuteNode] First attempt failed for node ${nodeId}, trying with adjusted query...`
            )
            this.logAndSave(`node_${nodeId}_first_attempt_failed`, {
              nodeId,
              query,
              response
            })
          }
        } catch (error) {
          console.error(
            `[ExecuteNode] Attempt ${attempt} error for node ${nodeId}:`,
            error
          )
          if (attempt === 2) throw error // 第二次尝试时的错误直接抛出
        }
      }

      // 如果两次尝试都失败，标记节点为错误状态
      node.state = NODE_STATE.ERROR
      this.logAndSave(`node_${nodeId}_all_attempts_failed`, {
        nodeId,
        originalContent: node.content,
        adjustedContent: adjustedQuestion
      })

      // 不再处理该节点的子节点
      const childrenIds = this.getChildren(nodeId)
      for (const childId of childrenIds) {
        const childNode = this.nodes.get(childId)
        if (childNode) {
          childNode.state = NODE_STATE.ERROR
          this.logAndSave(`node_${childId}_skipped`, {
            reason: `Parent node ${nodeId} failed`
          })
        }
      }
    } catch (error) {
      console.error(`[ExecuteNode] Error for node ${nodeId}:`, error)
      node.state = NODE_STATE.ERROR
      this.logAndSave(`node_${nodeId}_error`, {
        nodeId,
        error: getErrorMessage(error),
        content: node.content
      })

      // 同样不处理子节点
      const childrenIds = this.getChildren(nodeId)
      for (const childId of childrenIds) {
        const childNode = this.nodes.get(childId)
        if (childNode) {
          childNode.state = NODE_STATE.ERROR
          this.logAndSave(`node_${childId}_skipped`, {
            reason: `Parent node ${nodeId} failed with error`
          })
        }
      }
    }
  }

  // 新增方法：获取所有祖先节点（从直接父节点到根节点）
  private getAllAncestors (nodeId: string): string[] {
    const ancestors: string[] = []
    let currentId = nodeId

    while (true) {
      const parents = this.getParents(currentId)
      if (parents.length === 0) break

      // 在这个实现中，每个节点只有一个父节点
      const parentId = parents[0]
      ancestors.push(parentId)
      currentId = parentId
    }

    return ancestors
  }

  private async processRootNode (rootId: string) {
    console.log('\n[ProcessRoot] Starting root node processing')
    const root = this.nodes.get(rootId)
    if (!root) return

    // 收集所有子孙节点
    const allDescendants = this.getAllDescendants(rootId)
    const descendants = allDescendants
      .map(id => this.nodes.get(id))
      .filter((node): node is Node => !!node)

    const allFinished = descendants.every(
      node =>
        node.state === NODE_STATE.FINISHED || node.state === NODE_STATE.ERROR
    )

    if (!allFinished) {
      console.error('[ProcessRoot] Some descendant nodes are not finished')
      this.logAndSave('root_node_error', {
        descendants: descendants.map(c => ({
          id: c.id,
          state: c.state,
          content: c.content
        }))
      })
      return
    }

    const responses = descendants
      .filter(node => node.answer)
      .map(node => ({
        content: node.content,
        answer: node.answer || ''
      }))

    const finalAnswer = await this.llmPool
      .next()
      .generate(
        `${PROMPT.SUMMARY}\n## 原始问题\n${
          root.content
        }\n## 所有子问题回答\n${responses
          .map((r, i) => `[${i}] 问题：${r.content}\n回答：${r.answer}`)
          .join('\n---\n')}`
      )

    root.answer = finalAnswer
    root.state = NODE_STATE.FINISHED
    console.log('[ProcessRoot] Root node processing completed')
    this.logAndSave('root_node_result', {
      answer: finalAnswer,
      descendantResponses: responses
    })
  }

  // 新增方法：递归获取所有子孙节点
  private getAllDescendants (nodeId: string): string[] {
    const descendants: string[] = []
    const childrenIds = this.getChildren(nodeId)

    for (const childId of childrenIds) {
      descendants.push(childId)
      descendants.push(...this.getAllDescendants(childId))
    }

    return descendants
  }

  addRootNode (nodeContent: string) {
    const node: Node = {
      id: 'root',
      content: nodeContent,
      type: 'root',
      state: NODE_STATE.NOT_STARTED,
      answer: '',
      pages: []
    }
    this.nodes.set(node.id, node)
    this.edges.set(node.id, [])
    return node
  }

  addEdge (startNode: string, endNode: string) {
    const edges = this.edges.get(startNode) || []
    const edge = {
      id: getUUID(),
      name: endNode
    }
    edges.push(edge)
    this.edges.set(startNode, edges)
    return edge
  }

  getNode (nodeName: string): Node | undefined {
    return this.nodes.get(nodeName)
  }

  getChildren (nodeName: string): string[] {
    const edges = this.edges.get(nodeName) || []
    return edges.map(edge => edge.name)
  }

  getParents (nodeName: string): string[] {
    const parents: string[] = []
    this.edges.forEach((edges, startNode) => {
      if (edges.some(edge => edge.name === nodeName)) {
        parents.push(startNode)
      }
    })
    return parents
  }

  reset (): void {
    this.nodes.clear()
    this.edges.clear()
  }
}

type NodeType = 'root' | 'searcher'

interface Node {
  id: string
  type: NodeType
  content: string
  answer?: string
  pages?: Page[]
  state: NODE_STATE
  queries?: Query[]
}

interface RawNode {
  content: string
  children: RawNode[]
}

interface Edge {
  id: string
  name: string
}

enum NODE_STATE {
  NOT_STARTED = 1,
  RUNNING = 2,
  FINISHED = 3,
  ERROR = 4
}

export { SearchGraph }
