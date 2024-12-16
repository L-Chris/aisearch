export const PROMPT = {
    PLAN: `## 任务介绍
  请你将这个问题拆分成能够通过搜索回答的子问题(没有关联的问题可以同步并列搜索），每个搜索的问题应该是一个单一问题，即单个具体人、事、物、具体时间点、地点或知识点的问题，不是一个复合问题(比如某个时间段)
  ## 注意事项
  1. 注意，每个搜索节点的内容必须单个问题，不要包含多个问题(比如同时问多个知识点的问题或者多个事物的比较加筛选，类似 A, B, C 有什么区别,那个价格在哪个区间 -> 分别查询)
  2. 若一个问题需要多个搜索节点，则需要将问题拆分成多个子问题，每个子问题都是一个单一问题
  ## 返回格式示例，结果为JSON格式
  ===
  {
    "nodes": [
      {
        "content": "子问题1内容",
        "children": [
          {
            "content": "子问题1.1内容",
            "children": []
          },
          {
            "content": "子问题1.2内容",
            "children": []
          }
          // 其他子节点
        ]
      },
      {
        "content": "子问题2内容",
        "children": []
      },
      // 其他子节点
    ]
  }
  ===
  `,
    SUMMARY: `基于提供的已知问题和搜索结果，撰写一篇详细完备的最终回答。
  - 回答内容需要逻辑清晰，层次分明，确保读者易于理解。
  - 回答中每个关键点需标注引用的搜索结果来源(保持跟问答对中的索引一致)，以确保信息的可信度。给出索引的形式为[int]，如果有多个索引，则用多个[]表示，如[id_1][id_2]。
  - 回答部分需要全面且完备，不要出现"基于上述内容"等模糊表达，最终呈现的回答不包括提供给你的问答对。
  - 语言风格需要专业、严谨，避免口语化表达。
  - 保持统一的语法和词汇使用，确保整体文档的一致性和连贯性。`,
  ANSWER: `基于提供的已知问题和搜索结果，撰写一篇详细完备的最终回答。
  - 回答内容需要逻辑清晰，层次分明，确保读者易于理解。
  - 回答中每个关键点需标注引用的搜索结果来源(保持跟问答对中的索引一致)，以确保信息的可信度。给出索引的形式为[int]，如果有多个索引，则用多个[]表示，如[id_1][id_2]。
  - 回答部分需要全面且完备，不要出现"基于上述内容"等模糊表达，最终呈现的回答不包括提供给你的问答对。
  - 语言风格需要专业、严谨，避免口语化表达。
  - 保持统一的语法和词汇使用，确保整体文档的一致性和连贯性。`,
}