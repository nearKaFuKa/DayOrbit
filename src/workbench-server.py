#!/usr/bin/python3
# 我的工作台（DayOrbit）· 本地静态服务（仅本机回环，无目录列表）
# 固定 localhost 来源，Chrome 对 localhost 的文件夹授权才能持久保留。
# 用法：
#   python src/workbench-server.py                 # 服务脚本所在的仓库根目录，端口 8765
#   python src/workbench-server.py --root DIR      # 服务指定目录（如镜像目录）
#   python src/workbench-server.py --port 8766     # 换端口；也可用环境变量 WORKBENCH_PORT
import http.server, socketserver, os, sys
from urllib.parse import unquote, quote, urlsplit

WHITE_LIST = (
    '/工作台.html', '/manifest.webmanifest',
    '/icons/workbench-192.png', '/icons/workbench-512.png',
    '/src/workbench-core.js', '/src/workbench-window.js'
)

def resolve_root():
    if '--root' in sys.argv:
        return os.path.abspath(sys.argv[sys.argv.index('--root') + 1])
    if os.environ.get('WORKBENCH_SITE'):
        return os.path.abspath(os.environ['WORKBENCH_SITE'])
    # 默认：脚本在 src/ 下，服务仓库根目录
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def resolve_port():
    if '--port' in sys.argv:
        return int(sys.argv[sys.argv.index('--port') + 1])
    if os.environ.get('WORKBENCH_PORT'):
        return int(os.environ['WORKBENCH_PORT'])
    return 8765

class Handler(http.server.SimpleHTTPRequestHandler):
    def send_head(self):
        path = unquote(urlsplit(self.path).path)
        if path == '/':  # 根路径直接跳到应用页
            self.send_response(302)
            self.send_header('Location', quote('/工作台.html'))
            self.end_headers()
            return None
        if path not in WHITE_LIST:
            self.send_error(404, 'Not found')
            return None
        return super().send_head()
    def list_directory(self, path):
        self.send_error(404, 'No directory listing')
        return
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')  # 工作台.html 高频迭代，别吃缓存
        super().end_headers()

class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

if __name__ == '__main__':
    # Windows 控制台默认编码可能不含中文，避免请求日志触发 UnicodeEncodeError
    if hasattr(sys.stderr, 'reconfigure'):
        try: sys.stderr.reconfigure(errors='replace')
        except Exception: pass
    root, port = resolve_root(), resolve_port()
    os.chdir(root)
    print('[DayOrbit] serving %s at http://127.0.0.1:%d/%s' % (root, port, quote('工作台.html')))
    Server(('127.0.0.1', port), Handler).serve_forever()
