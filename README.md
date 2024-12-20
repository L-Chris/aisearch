# 🔍 AI Search Engine

A powerful AI-driven search engine capable of breaking down complex questions into sub-questions and recursively searching for answers.

## ✨ Features

- 🤖 Smart Question Decomposition - Automatically breaks complex queries into searchable sub-questions
- 🌲 Tree Search Structure - Implements deep search through question tree construction
- 🔄 Parallel Search Processing - Supports multi-threaded concurrent search for improved efficiency
- 🧠 Intelligent Answer Synthesis - Uses AI to summarize and synthesize final answers
- 🛡️ Built-in Anti-Crawler Protection - Smart request scheduling to avoid bans
- ⚡ High Performance - Page pool reuse and intelligent caching mechanism
- 📝 Smart Query Building - Optimizes search queries with domain-specific commands and removes colloquial expressions
- 🔄 Multi-Engine Support - Supports multiple search engines including Bing and Baidu
- 🌐 Proxy Support - Flexible proxy configuration for different regions
- 🔋 LLM Pool - Multiple LLM provider support with automatic load balancing

## 🚀 Quick Start

### Install

```bash
npm install aisy
```

### Basic Usage

```typescript
import { SearchGraph } from 'aisy'
const search = new SearchGraph({
  proxy: 'http://127.0.0.1:7890' // Optional proxy
})
const result = await search.plan('Complex problem...')
console.log(result.answer)
```

### Environment Variable Configuration

```bash
DEEPSEEK_API_KEY=
DEEPSEEK_ENDPOINT=
KIMI_API_KEY=
KIMI_ENDPOINT=
QWEN_API_KEY=
QWEN_ENDPOINT=
```

## 📖 API Documentation 

### SearchGraph

The main search engine class, used to handle the decomposition and search of complex problems.

```typescript
typescript
interface SearchOptions {
  proxy?: string // Proxy server
  maxConcurrency?: number // Maximum concurrency
  timeout?: number // Timeout (ms)
  maxResults?: number // Maximum number of results per search
}
class SearchGraph {
  constructor(options?: SearchOptions)
  // Analyze the problem and perform the search
  async plan(question: string): Promise<{
    answer: string
    pages: Page[]
  }>
}
```

### Searcher

The class that performs a single search.

```typescript
interface Page {
  id: number
  title: string
  url: string
  content?: string
}
class Searcher {
  constructor(options?: SearchOptions)
  // Perform a search
  async run(content: string): Promise<{
    content: string
    pages: Page[]
    answer: string
  }>
}
```

## 🛠️ Advanced Configuration

### Custom Search Engine

By default, Bing is used for searching. You can modify the search engine by configuring:

```typescript
const search = new SearchGraph({
  baseURL: 'https://www.google.com/search'
})
```

### Adjust Concurrency and Timeout

```typescript
const search = new SearchGraph({
  maxConcurrency: 5, // Maximum 5 concurrent requests
  timeout: 20000, // 20 seconds timeout
  maxResults: 10 // 10 results per search
})
```

### Advanced Configuration

#### LLM Pool Configuration

```typescript
const search = new SearchGraph({
  llmPool: {
    providers: [
      {
        endpoint: process.env.DEEPSEEK_ENDPOINT,
        apiKey: process.env.DEEPSEEK_API_KEY,
        model: 'deepseek-chat'
      },
      {
        endpoint: process.env.KIMI_ENDPOINT,
        apiKey: process.env.KIMI_API_KEY,
        model: 'kimi-chat'
      },
      {
        endpoint: process.env.QWEN_ENDPOINT,
        apiKey: process.env.QWEN_API_KEY,
        model: 'qwen-chat'
      }
    ]
  }
})
```

#### Search Engine Configuration

```typescript
const search = new SearchGraph({
  searchEngine: 'baidu', // 'bing' or 'baidu'
  baseURL: 'https://www.baidu.com/s', // optional, will be set automatically based on searchEngine
  proxy: 'http://127.0.0.1:7890'
})
```

## 📝 Examples

```typescript
// Complex problem decomposition
const result = await search.plan('Explain the concept of quantum entanglement and its application in quantum computing')
// Get specific information
const result = await search.plan(
  'Which movie had the highest box office in the Spring Festival of 2024? What is the specific data?'
)
// Multi-step query
const result = await search.plan(
  'What is the revenue of Apple\'s latest financial report? How much did it increase compared to last year?'
)
```

## 🤝 Contribution

Welcome to submit issues and PRs!

## 📄 License

MIT © [Jiahui.Liang](LICENSE)
