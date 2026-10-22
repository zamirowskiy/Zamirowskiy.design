"""Локальная админка сайта-портфолио.

Запуск:  python tools/admin.py   (или двойной клик по «Админка.bat»)
Открывает http://127.0.0.1:8777/admin/ — там правятся тексты, логотип,
разделы и кейсы. Сохранение пишет прямо в файлы сайта:

    data/content.js         все тексты, разделы и кейсы
    assets/works/           картинки кейсов
    assets/brand/           логотип и фото, загруженные через админку
    data/backups/           копия content.js перед каждым сохранением (последние 30)

Сервер слушает только этот компьютер (127.0.0.1) и работает на стандартной
библиотеке Python — ничего ставить не нужно. Сам сайт остаётся статикой:
после правок папку можно заливать на хостинг как есть.
"""

import json
import os
import re
import secrets
import subprocess
import sys
import threading
import time
import webbrowser
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT = os.path.join(ROOT, 'data', 'content.js')
BACKUPS = os.path.join(ROOT, 'data', 'backups')
UPLOAD_DIRS = {'works': 'assets/works', 'brand': 'assets/brand'}
ALLOWED_EXT = {'.jpg', '.jpeg', '.png', '.webp', '.svg', '.gif'}
MAX_UPLOAD = 25 * 1024 * 1024
KEEP_BACKUPS = 30
PREFIX = 'window.CONTENT = '
HEADER = ('// Содержимое сайта. Правится через админку (Админка.bat) — руками можно, но аккуратно:\n'
          '// это JSON, кавычки только двойные.\n')

# Простая защита от чужих страниц в браузере: запись принимается только
# с этим токеном, а он отдаётся лишь странице админки на этом же адресе.
TOKEN = secrets.token_urlsafe(24)

PUBLISH_LOCK = threading.Lock()
GIT_ENV = dict(os.environ, GIT_TERMINAL_PROMPT='0')
NO_WINDOW = 0x08000000 if os.name == 'nt' else 0


def read_content():
    with open(CONTENT, encoding='utf-8') as f:
        src = f.read()
    i = src.index(PREFIX) + len(PREFIX)
    return json.loads(src[i:].strip().rstrip(';'))


def validate(data):
    if not isinstance(data, dict):
        raise ValueError('ожидался объект')
    for key, kind in (('site', dict), ('categories', list), ('projects', list)):
        if not isinstance(data.get(key), kind):
            raise ValueError('нет раздела «%s»' % key)
    ids = set()
    for c in data['categories']:
        if not c.get('id') or not c.get('name'):
            raise ValueError('у раздела нет названия')
        ids.add(c['id'])
    seen = set()
    for p in data['projects']:
        if not p.get('id') or not str(p.get('title', '')).strip():
            raise ValueError('у кейса нет названия')
        if p['id'] in seen:
            raise ValueError('повторяется id кейса: %s' % p['id'])
        seen.add(p['id'])
        p['cats'] = [c for c in p.get('cats', []) if c in ids]
        for img in p.get('images', []):
            if not safe_rel(img):
                raise ValueError('странный путь к картинке: %s' % img)


def safe_rel(path):
    """Путь внутри папки сайта, без выхода наверх."""
    if not isinstance(path, str) or path.startswith(('/', '\\')) or ':' in path:
        return False
    full = os.path.normpath(os.path.join(ROOT, path))
    return full.startswith(ROOT + os.sep)


def write_content(data):
    os.makedirs(BACKUPS, exist_ok=True)
    if os.path.exists(CONTENT):
        stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
        with open(CONTENT, encoding='utf-8') as f:
            old = f.read()
        with open(os.path.join(BACKUPS, 'content-%s.js' % stamp), 'w', encoding='utf-8') as f:
            f.write(old)
        backups = sorted(n for n in os.listdir(BACKUPS) if n.startswith('content-'))
        for name in backups[:-KEEP_BACKUPS]:
            os.remove(os.path.join(BACKUPS, name))

    text = HEADER + PREFIX + json.dumps(data, ensure_ascii=False, indent=2) + ';\n'
    tmp = CONTENT + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write(text)
    os.replace(tmp, CONTENT)        # атомарно: сайт никогда не увидит полфайла


def git(*args, timeout=90):
    """Запуск git в папке сайта. Возвращает (код, вывод)."""
    try:
        r = subprocess.run(['git'] + list(args), cwd=ROOT, capture_output=True, text=True,
                           stdin=subprocess.DEVNULL,
                           encoding='utf-8', errors='replace', timeout=timeout,
                           env=GIT_ENV, creationflags=NO_WINDOW)
    except FileNotFoundError:
        return 127, 'Не найден git. Установите Git for Windows (git-scm.com).'
    except subprocess.TimeoutExpired:
        return 124, 'git не ответил за %d с (нет интернета или GitHub недоступен).' % timeout
    return r.returncode, ((r.stdout or '') + (r.stderr or '')).strip()


def publish_state():
    """Что ещё не ушло на GitHub: есть ли правки в файлах и неотправленные коммиты."""
    code, out = git('status', '--porcelain', timeout=20)
    if code != 0:
        return {'ok': False, 'error': out}
    changed = [l for l in out.splitlines() if l.strip()]
    code, ahead = git('rev-list', '--count', '@{u}..HEAD', timeout=20)
    ahead = int(ahead) if code == 0 and ahead.isdigit() else 0
    return {'ok': True, 'changed': len(changed), 'ahead': ahead, 'pending': bool(changed) or ahead > 0}


def publish():
    """Коммит всех правок и отправка на GitHub. Сайт обновится сам (GitHub Pages)."""
    with PUBLISH_LOCK:
        st = publish_state()
        if not st['ok']:
            return 500, {'error': st['error']}
        if not st['pending']:
            return 200, {'ok': True, 'nothing': True}

        if st['changed']:
            code, out = git('add', '-A')
            if code:
                return 500, {'error': 'git add: ' + out}
            ident = []
            if not git('config', 'user.email')[1]:
                ident = ['-c', 'user.name=Roman Zamirovsky', '-c', 'user.email=kimininarus76@gmail.com']
            msg = 'Правки через админку, ' + datetime.now().strftime('%d.%m.%Y %H:%M')
            code, out = git(*(ident + ['commit', '-m', msg]))
            if code:
                return 500, {'error': 'git commit: ' + out}

        # на GitHub могли появиться свои правки (например, файл CNAME) — подтягиваем
        code, out = git('pull', '--rebase', '--autostash')
        if code:
            git('rebase', '--abort', timeout=20)
            return 500, {'error': 'Не удалось подтянуть правки с GitHub: ' + out[-400:]}
        code, out = git('push')
        if code:
            return 500, {'error': 'Не отправилось на GitHub: ' + out[-400:]}
        return 200, {'ok': True}


def slugify(name):
    table = str.maketrans({
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh',
        'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
        'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'c',
        'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu',
        'я': 'ya'})
    s = name.lower().translate(table)
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return s[:48] or 'image'


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):
        if '/api/' in (self.path or ''):
            sys.stderr.write('  %s\n' % (fmt % args))

    def end_headers(self):
        # админка всегда видит свежие файлы, без кэша браузера
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def send_json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def authorized(self):
        host = (self.headers.get('Host') or '').split(':')[0]
        return host in ('127.0.0.1', 'localhost') and self.headers.get('X-Admin-Token') == TOKEN

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == '/api/content':
            try:
                self.send_json(200, {'content': read_content(), 'token': TOKEN})
            except Exception as e:
                self.send_json(500, {'error': 'Не прочитал data/content.js: %s' % e})
            return
        if url.path == '/api/publish-state':
            self.send_json(200, publish_state())
            return
        if url.path == '/api/backups':
            names = sorted((n for n in os.listdir(BACKUPS) if n.startswith('content-')), reverse=True) \
                if os.path.isdir(BACKUPS) else []
            self.send_json(200, {'backups': names})
            return
        super().do_GET()

    def do_POST(self):
        url = urlparse(self.path)
        if not self.authorized():
            self.send_json(403, {'error': 'Нет доступа. Перезагрузите страницу админки.'})
            return
        length = int(self.headers.get('Content-Length') or 0)
        if length > MAX_UPLOAD:
            self.send_json(413, {'error': 'Файл больше 25 МБ'})
            return
        body = self.rfile.read(length)

        if url.path == '/api/content':
            try:
                data = json.loads(body.decode('utf-8'))
                validate(data)
                write_content(data)
            except Exception as e:
                self.send_json(400, {'error': str(e)})
                return
            self.send_json(200, {'ok': True, 'saved': datetime.now().strftime('%H:%M:%S')})
            return

        if url.path == '/api/upload':
            q = parse_qs(url.query)
            kind = (q.get('kind') or ['works'])[0]
            name = (q.get('name') or ['image.jpg'])[0]
            folder = UPLOAD_DIRS.get(kind)
            base, ext = os.path.splitext(name)
            ext = ext.lower()
            if not folder or ext not in ALLOWED_EXT or not body:
                self.send_json(400, {'error': 'Можно загрузить JPG, PNG, WEBP, SVG или GIF'})
                return
            os.makedirs(os.path.join(ROOT, folder), exist_ok=True)
            stem = slugify(base)
            rel = '%s/%s%s' % (folder, stem, ext)
            n = 2
            while os.path.exists(os.path.join(ROOT, rel)):     # ничего не перезаписываем
                rel = '%s/%s-%d%s' % (folder, stem, n, ext)
                n += 1
            with open(os.path.join(ROOT, rel), 'wb') as f:
                f.write(body)
            self.send_json(200, {'path': rel})
            return

        if url.path == '/api/publish':
            code, obj = publish()
            self.send_json(code, obj)
            return

        if url.path == '/api/shutdown':
            self.send_json(200, {'ok': True})
            threading.Thread(target=self.server.shutdown, daemon=True).start()
            return

        if url.path == '/api/restore':
            q = parse_qs(url.query)
            name = (q.get('name') or [''])[0]
            path = os.path.join(BACKUPS, os.path.basename(name))
            if not name.startswith('content-') or not os.path.exists(path):
                self.send_json(404, {'error': 'Нет такой копии'})
                return
            with open(path, encoding='utf-8') as f:
                src = f.read()
            data = json.loads(src[src.index(PREFIX) + len(PREFIX):].strip().rstrip(';'))
            write_content(data)
            self.send_json(200, {'ok': True})
            return

        self.send_json(404, {'error': 'Неизвестный адрес'})


def main():
    # под pythonw (запуск без окна) нет консоли — пишем лог в файл, так видно ошибки
    if sys.stdout is None or sys.stderr is None:
        os.makedirs(BACKUPS, exist_ok=True)
        log = open(os.path.join(BACKUPS, 'admin.log'), 'a', encoding='utf-8', buffering=1)
        sys.stdout = sys.stdout or log
        sys.stderr = sys.stderr or log
    port = int(os.environ.get('ADMIN_PORT', '8777'))
    try:
        server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    except OSError:
        print('Порт %d занят — похоже, админка уже запущена. Открываю браузер.' % port)
        webbrowser.open('http://127.0.0.1:%d/admin/' % port)
        time.sleep(2)
        return
    url = 'http://127.0.0.1:%d/admin/' % port
    print('Админка: %s' % url)
    print('Сайт:    http://127.0.0.1:%d/' % port)
    print('Остановить: кнопка «Выключить админку» в меню слева или Ctrl+C.')
    if '--no-browser' not in sys.argv:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
