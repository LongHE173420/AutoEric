
## 1. Yêu Cầu Hệ Thống
Đảm bảo máy tính đã cài đặt sẵn Node.js. Bạn có thể kiểm tra bằng cách mở CMD hoặc Terminal và gõ:
```bash
node -v
npm -v
```

---

## 2. Chuẩn Bị Dữ Liệu
Bot yêu cầu dữ liệu tài khoản và proxy để hoạt động.

### Nguồn Tài Khoản (Accounts)
Tài khoản được lấy trực tiếp từ bảng Accounts trong cơ sở dữ liệu MySQL thông qua hàm `getAccountsFromDb()`.
- Hãy đảm bảo bạn đã điền đầy đủ số điện thoại và mật khẩu vào Database.
- Bot sẽ tự động lấy và phân phát danh sách tài khoản cho các luồng xử lý (worker) khi chạy lệnh `npm start`. Mọi cấu hình kết nối Database nằm ở biến môi trường hoặc file `.env`.

### File Proxy (data/proxies.txt)
- **Vị trí file:** `data/proxies.txt`
- **Định dạng:** Điền theo chuẩn URL. Mỗi dòng một Proxy.
  - Có mật khẩu: `http://user:pass@ip:port`
  - Không mật khẩu: `http://ip:port`
- **Ví dụ:**
  ```text
  http://eric:pass789@192.168.1.1:8080
  http://172.16.5.9:3128
  ```

---

## 3. Cài Đặt và Khởi Chạy
Mở Terminal trỏ đến thư mục dự án (`AutoEric`), sau đó gõ lần lượt các lệnh dưới đây:

1. **Cài đặt thư viện (Chỉ thực hiện lần đầu tiên)**
   ```bash
   npm install
   ```
2. **Khởi chạy hệ thống**
   ```bash
   npm start
   ```

---

## 4. Theo Dõi và Gỡ Lỗi
Kết quả tương tác và thông báo lỗi của từng tài khoản sẽ được hệ thống lưu lại chi tiết tại thư mục `data/logs/`.
- File ghi nhận theo ngày: `login-worker-YYYY-MM-DD.log`
- Các luồng lỗi nghiêm trọng, kết quả Thả cảm xúc, Đăng bài, Kết bạn, Cày View mạng xã hội đều hiển thị chi tiết tại file log tương ứng của ngày làm việc đó.
