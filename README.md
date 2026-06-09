# finder-mcp-server

針對 Finder 的獨立 MCP server。只暴露具名工具，不接受任意 script 輸入，徹底沒有 `do shell script` 入口。

## 安全設計

- **零 script 輸入**：所有 AppleScript 都是程式碼裡的硬編碼字面量，Claude 傳進來的只有參數值（路徑、名稱）
- **沒有 `do shell script`**：整個 codebase 沒有這個呼叫
- **單一執行路徑**：只有 `runAppleScript()` 這一個函式會呼叫 `osascript`，所有工具都經過它

## 工具清單

| 工具 | 說明 | 破壞性 |
|------|------|--------|
| `finder_list_folder` | 列出資料夾內容 | 否 |
| `finder_get_selection` | 取得目前選取的項目 | 否 |
| `finder_get_info` | 取得檔案/資料夾的 metadata | 否 |
| `finder_open_folder` | 在 Finder 開啟資料夾 | 否 |
| `finder_reveal` | 在 Finder 中高亮顯示項目 | 否 |
| `finder_create_folder` | 建立新資料夾 | 否 |
| `finder_rename` | 重新命名檔案或資料夾 | 否 |
| `finder_move_to_trash` | 移至垃圾桶（可還原） | 是 |

## 安裝

```bash
# 需求：Node.js >= 18
cd finder-mcp-server
npm install
npm run build
```

## 設定 MCP Client

在你的 `claude_desktop_config.json`（或 `mcp.json`）加入：

```json
{
  "mcpServers": {
    "finder": {
      "command": "node",
      "args": ["/絕對路徑/finder-mcp-server/dist/index.js"]
    }
  }
}
```

路徑改成你實際 clone 的位置。

## macOS 權限

System Settings → Privacy & Security → Automation

找到跑這個 server 的 app（通常是 Terminal 或 Claude Desktop），確認 Finder 的 checkbox 有勾。

## 擴充工具

在 `src/index.ts` 加新的 `server.registerTool(...)` block。
所有 AppleScript 都寫在工具內部，不要加任何接受 script 字串的參數。
