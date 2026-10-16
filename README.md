# 在自己的 PC 上執行 LINE 聊天機器人

這個範例使用 LINE Messaging API。它會回覆文字訊息，並按 LINE 使用者 ID 保留最多 12 則訊息的短期對話脈絡；閒置 30 分鐘後記憶會逾期。輸入「清除記憶」可立即重設。記憶只存在 Node 程序記憶體中，重啟程式也會清除。

## 需求

- Node.js 18 或更新版本
- 一個已啟用 Messaging API 的 LINE Official Account
- LINE Developers 的 Channel secret 與 Channel access token
- 一條可從網際網路連到本機的 HTTPS webhook 網址（例如 ngrok 或 Cloudflare Tunnel）

## 設定 LINE

1. 在 LINE Official Account Manager 建立官方帳號，再依 LINE Developers 的 Messaging API 入門文件啟用 Messaging API。
2. 到 LINE Developers Console 的 Messaging API channel，複製 **Channel secret** 與 **Channel access token**。請勿把它們貼到公開聊天室或提交到 Git。
3. 將 `.env.example` 複製成 `.env`，填入兩項憑證。

## 啟動

在專案資料夾執行：

```powershell
Copy-Item .env.example .env
# 用文字編輯器填入 .env 裡的兩項 LINE 憑證
npm start
```

看到 `LINE bot listening on http://localhost:3000` 即表示本機服務已啟動。可在瀏覽器開啟 `http://localhost:3000/` 確認狀態頁。

## 讓 LINE 連到這台 PC

LINE 的 webhook 必須使用公開 HTTPS URL；`localhost` 無法直接讓 LINE Platform 連入。安裝並登入 ngrok 後，在另一個終端機執行：

```powershell
ngrok http 3000
```

複製 ngrok 顯示的 HTTPS 網址，例如 `https://abc123.ngrok-free.app`，到 LINE Developers Console 的 **Messaging API** 設定：

- Webhook URL：`https://abc123.ngrok-free.app/callback`
- 啟用 **Use webhook**
- 按 **Verify** 確認成功
- 關閉官方帳號預設的自動回應／Greeting message，避免和程式回覆重複

ngrok 終端機和 `npm start` 都要保持執行。免費隧道網址可能在重啟後改變；網址改變時要回 Developers Console 更新 Webhook URL。

## 加好友並試聊

在 LINE Developers Console 或 Official Account Manager 取得官方帳號的 QR code／好友連結，用 LINE 加官方帳號為好友。傳「你好」，再傳一段內容並問它「我剛才說了什麼？」確認短期記憶；傳「清除記憶」後再試，機器人會忘掉先前內容。

## 記憶與隱私

每個 LINE 使用者各自有一份短期記憶，預設閒置 30 分鐘過期、最多保留 12 則訊息。可在 `.env` 設定 `MEMORY_TTL_MINUTES` 和 `MEMORY_MAX_MESSAGES`。資料不寫入磁碟；程式停止或重啟後即清空。

## 常見問題

- **Verify 失敗**：確認兩個終端機仍在執行、ngrok URL 使用 HTTPS 並以 `/callback` 結尾，且 `.env` 的 channel secret 正確。
- **Verify 成功但沒有回覆**：確認 access token 正確、已啟用 Use webhook，並檢查機器人終端機的 LINE API 錯誤訊息。
- **無法加好友**：確認官方帳號已發布／可被搜尋，並使用 Console 提供的 QR code 或好友連結。
- **離開電腦後不能用**：本範例依賴你的 PC 與隧道持續運作；電腦睡眠、關機或網路中斷時，機器人無法收到訊息。
