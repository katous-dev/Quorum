# AGY Proxy — Antigravity CLI (agy.exe) → OpenAI-Compatible Bridge

Proxy server viết bằng Node.js, nhận request theo chuẩn OpenAI từ Rakazo và chuyển tiếp trực tiếp vào Antigravity CLI (`agy.exe`) đang chạy và đã đăng nhập trên máy của bạn.

> 💡 **KHÔNG CẦN API KEY**: Proxy sử dụng trực tiếp session tài khoản Antigravity đã đăng nhập trên máy thông qua `agy.exe`. Bạn có quyền truy cập toàn bộ các model của Antigravity bao gồm Gemini 3.8 Flash, Claude Sonnet 4.6, Claude Opus 4.6,...

---

## 1. Khởi động Proxy

Proxy lắng nghe mặc định tại port `8765`:

```powershell
cd e:\Project\Quroum\tools\agy-proxy
node src/index.js
```

Khi khởi động thành công, bạn sẽ thấy log:
```text
[agy-proxy] [INFO] AGY Proxy listening on http://0.0.0.0:8765
[agy-proxy] [INFO] Backend: Antigravity CLI (C:\Users\...\AppData\Local\agy\bin\agy.exe)
[agy-proxy] [INFO] Default Model: gemini-3.8-flash-high
[agy-proxy] [INFO] Auth: Uses your logged-in Antigravity account — NO API KEY NEEDED
```

---

## 2. Kết nối với Rakazo Web

1. Mở trình duyệt vào **`http://localhost:5173`**
2. Vào **Settings** ➜ **Models** ➜ **Add Connection**
3. Chọn **OpenAI-Compatible**
4. Điền:
   - **Base URL**: `http://host.docker.internal:8765/v1`
   - **API Key**: `antigravity` *(hoặc bất kỳ ký tự nào, proxy không yêu cầu key)*
   - **Model ID**: `gemini-3.8-flash-high` *(hoặc `claude-sonnet-4-6`, `gemini-3.8-flash-medium`)*
5. Bấm **Test & Save**.

---

## 3. Các Model Antigravity được hỗ trợ

| Model ID trong Rakazo | Model Antigravity thực tế | Ghi chú |
|---|---|---|
| `gemini-3.8-flash-high` | Gemini 3.8 Flash (High) | Khuyên dùng mặc định |
| `gemini-3.8-flash-medium` | Gemini 3.8 Flash (Medium) | Tốc độ nhanh |
| `gemini-3.8-flash-low` | Gemini 3.8 Flash (Low) | Tiết kiệm tài nguyên |
| `claude-sonnet-4-6` | Claude Sonnet 4.6 (Thinking) | Suy luận chuyên sâu |
| `claude-opus-4-6-thinking` | Claude Opus 4.6 (Thinking) | Model lớn nhất |
| `gpt-oss-120b-medium` | GPT-OSS 120B (Medium) | Model mã nguồn mở |

---

## 4. Kiểm tra hoạt động (Smoke Test)

```powershell
node test.js
```
