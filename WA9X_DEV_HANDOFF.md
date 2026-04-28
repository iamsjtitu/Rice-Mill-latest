# wa.9x.design — 2 Bugs + 1 New Feature Required

Hi! Mill management app uses wa.9x.design as WhatsApp provider. Need fixes:

---

## 🔴 BUG #1 (BLOCKER): sendGroup strips `@` and `.` from groupId

**Reproduce:**
```bash
curl -X POST https://wa.9x.design/api/v2/sendGroup \
  -H "Authorization: Bearer <API_KEY>" \
  -d "groupId=120363424861931093@g.us&text=Test"
```

**Actual response:**
```json
{
  "success": false,
  "statusCode": 400,
  "error": "",
  "data": { "groupId": "120363424861931093gus" }
}
```

Notice: `@` and `.` are **stripped server-side**. WhatsApp groupIds MUST keep `@g.us` suffix.

**Fix:** Remove aggressive sanitization on `groupId` field. If validation needed:
```python
re.match(r'^\d+@g\.us$', groupId)
```

`getGroupList` already returns groupIds with `@g.us` correctly — bug is **only** in sendGroup input handler.

---

## 🟡 BUG #2: `error` field always empty on failures

```json
{"success": false, "statusCode": 400, "error": "", ...}
```

**Fix:** Populate `error` with actual reason:
- `"Invalid groupId format"`
- `"Group not found"`
- `"Media URL fetch failed"`
- `"Rate limit exceeded"`

---

## ✅ NEW ENDPOINTS: Direct file upload (no more tmpfiles.org middleman)

### `POST /api/v2/sendMessageFile`
**Content-Type:** `multipart/form-data`

| Field | Required | Notes |
|---|---|---|
| `phonenumber` | ✅ | e.g., `919876543210` |
| `file` | ✅ | binary (PDF/docx/xlsx/jpg/png/mp4) |
| `caption` | optional | text caption |
| `filename` | optional | override displayed name |

### `POST /api/v2/sendGroupFile`
**Content-Type:** `multipart/form-data`

| Field | Required | Notes |
|---|---|---|
| `groupId` | ✅ | `<digits>@g.us` |
| `file` | ✅ | binary |
| `caption` | optional | |
| `filename` | optional | |

### Response (match existing format):
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "...",
  "error": "",
  "data": {
    "messageId": "<uuid>",
    "groupId": "<id>",
    "fileType": "pdf"
  }
}
```

**Constraints:**
- Max file size: 100 MB
- Allowed MIMEs: `application/pdf`, `image/*`, `video/mp4`, `application/vnd.openxmlformats-officedocument.*`, `application/msword`, `application/vnd.ms-excel`
- Auto-detect MIME from `filename` extension

---

## Test after fix:

```bash
curl -X POST https://wa.9x.design/api/v2/sendGroup \
  -H "Authorization: Bearer <API_KEY>" \
  -d "groupId=120363424861931093@g.us&text=Fixed!"
```

Expected: `{"success": true, "statusCode": 200, ...}`

Test groupId `120363424861931093@g.us` works in `getGroupList` already.

Once done, ping back — I'll verify and switch to direct file upload.
