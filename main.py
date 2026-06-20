import os

import tornado.httpserver
import tornado.ioloop

from server import make_app


def main() -> None:
    app = make_app()
    server = tornado.httpserver.HTTPServer(app)
    port = int(os.environ.get("PORT", "8080"))
    server.listen(port)
    print(f"Running gitui on http://localhost:{port}")
    tornado.ioloop.IOLoop.current().start()


if __name__ == "__main__":
    main()
