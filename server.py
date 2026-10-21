import http.server
import socketserver
import json
import os
import sys
import socket

PORT = 5173
DATA_FILE = os.path.join(os.path.dirname(__file__), "team_solutions_db.json")

def get_local_ips():
    ips = []
    try:
        hostname = socket.gethostname()
        for ip in socket.gethostbyname_ex(hostname)[2]:
            if not ip.startswith("127."):
                ips.append(ip)
    except Exception:
        pass
    return ips

class TeamCodingHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # 모든 오리진에서 CORS 완벽 허용 & 캐시 방지
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        # 데이터 동기화 조회 엔드포인트
        if self.path.startswith('/api/sync') or self.path.startswith('/api/load'):
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            if os.path.exists(DATA_FILE):
                try:
                    with open(DATA_FILE, 'r', encoding='utf-8') as f:
                        content = f.read().strip()
                        if content:
                            self.wfile.write(content.encode('utf-8'))
                        else:
                            self.wfile.write(b'{}')
                except Exception as e:
                    self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
            else:
                self.wfile.write(json.dumps({}).encode('utf-8'))
            return
        
        # 일반 정적 파일 서빙 (HTML, JS, CSS 등)
        return super().do_GET()

    def do_POST(self):
        # 데이터 저장 엔드포인트
        if self.path.startswith('/api/sync') or self.path.startswith('/api/save'):
            content_length = int(self.headers.get('Content-Length', 0))
            post_body = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_body.decode('utf-8'))
                with open(DATA_FILE, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({
                    "status": "success",
                    "message": "서버 파일(team_solutions_db.json)에 성공적으로 영구 저장되었습니다.",
                    "size": len(post_body)
                }).encode('utf-8'))
                print(f"[SAVE OK] {content_length} bytes saved to {os.path.basename(DATA_FILE)}")
                sys.stdout.flush()
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
                print(f"[SAVE ERROR] {e}")
                sys.stdout.flush()
            return

        self.send_response(404)
        self.end_headers()

class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True

def run_server():
    os.chdir(os.path.dirname(__file__))
    ips = get_local_ips()
    with ThreadedTCPServer(("0.0.0.0", PORT), TeamCodingHandler) as httpd:
        print("=" * 60)
        print("  [CODING MASTERS 100 TEAM SERVER RUNNING]")
        print("=" * 60)
        print(f"  * 내 컴퓨터 접속 주소:     http://localhost:{PORT}")
        for ip in ips:
            print(f"  * 다른 컴퓨터/팀원 접속 주소: http://{ip}:{PORT}")
        print(f"  * 데이터베이스 파일:      {DATA_FILE}")
        print("=" * 60)
        print("  (이 창을 켜두시면 모든 컴퓨터/브라우저에서 실시간 저장됩니다)")
        print("=" * 60)
        sys.stdout.flush()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n서버를 종료합니다.")

if __name__ == '__main__':
    run_server()
