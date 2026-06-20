import json
import tempfile
from pathlib import Path

import pygit2
import tornado.httpclient
import tornado.testing

from server import make_app


class GitServerTest(tornado.testing.AsyncHTTPTestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.repo_path = Path(self.temp_dir.name)
        self.repo = pygit2.init_repository(str(self.repo_path), bare=False)
        self._initialize_repo()
        super().setUp()

    def tearDown(self):
        self.temp_dir.cleanup()
        super().tearDown()

    def get_app(self):
        return make_app(str(self.repo_path))

    def _write_file(self, filename: str, content: str) -> pygit2.Oid:
        path = self.repo_path / filename
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        return self.repo.index.add(str(filename))

    def _commit(self, message: str) -> pygit2.Commit:
        author = pygit2.Signature("Test User", "test@example.com")
        committer = author
        self.repo.index.write()
        tree = self.repo.index.write_tree()
        parents = []
        if not self.repo.is_empty:
            parents = [self.repo.head.target]
        commit_id = self.repo.create_commit(
            "HEAD",
            author,
            committer,
            message,
            tree,
            parents,
        )
        return self.repo[commit_id]

    def _initialize_repo(self) -> None:
        self._write_file("README.md", "Initial commit\n")
        self.repo.index.write()
        self.repo.create_commit(
            "HEAD",
            pygit2.Signature("Test User", "test@example.com"),
            pygit2.Signature("Test User", "test@example.com"),
            "Initial commit",
            self.repo.index.write_tree(),
            [],
        )

    def test_health_endpoint(self):
        response = self.fetch("/api/health")
        self.assertEqual(response.code, 200)
        self.assertEqual(json.loads(response.body), {"status": "ok"})

    def test_commits_endpoint_returns_history(self):
        self._write_file("src/app.py", "print('hello')\n")
        self.repo.index.write()
        self._commit("Add app file")

        response = self.fetch("/api/commits")
        self.assertEqual(response.code, 200)
        payload = json.loads(response.body)
        self.assertEqual(payload["current_branch"], "master" if self.repo.head.shorthand == "master" else self.repo.head.shorthand)
        self.assertGreaterEqual(len(payload["commits"]), 2)
        self.assertEqual(payload["commits"][0]["message"], "Add app file")

    def test_commit_diff_endpoint_returns_patch(self):
        self._write_file("src/app.py", "print('hello')\n")
        self.repo.index.write()
        commit = self._commit("Add app file")

        response = self.fetch(f"/api/commit/{commit.id}")
        self.assertEqual(response.code, 200)
        payload = json.loads(response.body)
        self.assertEqual(payload["sha"], str(commit.id))
        self.assertIn("patch", payload)
        self.assertIn("src/app.py", payload["patch"])

    def test_commit_diff_endpoint_404_for_unknown_sha(self):
        response = self.fetch("/api/commit/0000000000000000000000000000000000000000")
        self.assertEqual(response.code, 404)

    def _unstaged_paths(self, payload):
        return [x["path"] for x in payload.get("unstaged", [])]

    def _staged_paths(self, payload):
        return [x["path"] for x in payload.get("staged", [])]

    def test_status_stage_and_commit_endpoints(self):
        # create an unstaged file
        self._write_file("new.txt", "hello world\n")

        # check status shows unstaged
        response = self.fetch("/api/status")
        self.assertEqual(response.code, 200)
        payload = json.loads(response.body)
        self.assertIn("unstaged", payload)
        self.assertIn("new.txt", self._unstaged_paths(payload))

        # stage the file
        resp = self.fetch(self.get_url("/api/stage"), method="POST", headers={"Content-Type": "application/json"}, body=json.dumps({"path": "new.txt", "action": "add"}))
        self.assertEqual(resp.code, 200)

        # status should now show it as staged
        response = self.fetch("/api/status")
        self.assertEqual(response.code, 200)
        payload = json.loads(response.body)
        self.assertIn("new.txt", self._staged_paths(payload))
        # verify type is correct
        staged = [x for x in payload.get("staged", []) if x["path"] == "new.txt"]
        self.assertEqual(staged[0]["type"], "added")

        # commit via API
        resp = self.fetch(self.get_url("/api/commit"), method="POST", headers={"Content-Type": "application/json"}, body=json.dumps({"message": "Add new.txt"}))
        self.assertEqual(resp.code, 200)
        body = json.loads(resp.body)
        self.assertEqual(body["message"], "Add new.txt")

        # status should be clean now
        response = self.fetch("/api/status")
        payload = json.loads(response.body)
        self.assertNotIn("new.txt", self._staged_paths(payload))
        self.assertNotIn("new.txt", self._unstaged_paths(payload))


    def test_discard_tracked_file_restores_content(self):
        # create and commit a tracked file
        self._write_file("tracked.txt", "original content\n")
        self.repo.index.write()
        self._commit("Add tracked.txt")

        # modify the file on disk without staging
        file_path = self.repo_path / "tracked.txt"
        file_path.write_text("modified content\n", encoding="utf-8")

        # verify it shows as unstaged
        response = self.fetch("/api/status")
        payload = json.loads(response.body)
        self.assertIn("tracked.txt", self._unstaged_paths(payload))

        # discard the change
        resp = self.fetch(
            self.get_url("/api/discard"),
            method="POST",
            headers={"Content-Type": "application/json"},
            body=json.dumps({"path": "tracked.txt"}),
        )
        self.assertEqual(resp.code, 200)

        # status should be clean
        response = self.fetch("/api/status")
        payload = json.loads(response.body)
        self.assertNotIn("tracked.txt", self._unstaged_paths(payload))

        # file content should be restored to HEAD version
        self.assertEqual(file_path.read_text(encoding="utf-8"), "original content\n")

    def test_discard_untracked_file_deletes_it(self):
        # create an untracked file (write to disk without staging)
        file_path = self.repo_path / "untracked.txt"
        file_path.write_text("new file\n", encoding="utf-8")

        # verify it shows as unstaged
        response = self.fetch("/api/status")
        payload = json.loads(response.body)
        self.assertIn("untracked.txt", self._unstaged_paths(payload))

        # discard (delete) the file
        resp = self.fetch(
            self.get_url("/api/discard"),
            method="POST",
            headers={"Content-Type": "application/json"},
            body=json.dumps({"path": "untracked.txt"}),
        )
        self.assertEqual(resp.code, 200)

        # file should be deleted from disk
        self.assertFalse(file_path.exists())

        # status should be clean
        response = self.fetch("/api/status")
        payload = json.loads(response.body)
        self.assertNotIn("untracked.txt", self._unstaged_paths(payload))

    def test_discard_missing_path_returns_400(self):
        resp = self.fetch(
            self.get_url("/api/discard"),
            method="POST",
            headers={"Content-Type": "application/json"},
            body=json.dumps({}),
        )
        self.assertEqual(resp.code, 400)

    def test_stage_deleted_file(self):
        # create and commit a tracked file
        self._write_file("to_delete.txt", "delete me\n")
        self.repo.index.write()
        self._commit("Add to_delete.txt")

        # delete the file from disk
        file_path = self.repo_path / "to_delete.txt"
        file_path.unlink()

        # verify it shows as unstaged
        response = self.fetch("/api/status")
        payload = json.loads(response.body)
        self.assertIn("to_delete.txt", self._unstaged_paths(payload))

        # stage the deletion
        resp = self.fetch(
            self.get_url("/api/stage"),
            method="POST",
            headers={"Content-Type": "application/json"},
            body=json.dumps({"path": "to_delete.txt", "action": "add"}),
        )
        self.assertEqual(resp.code, 200)

        # verify it moved to staged
        response = self.fetch("/api/status")
        payload = json.loads(response.body)
        self.assertNotIn("to_delete.txt", self._unstaged_paths(payload))
        self.assertIn("to_delete.txt", self._staged_paths(payload))


    def test_stage_all_and_unstage_all(self):
        # create two untracked files
        self._write_file("a.txt", "aaa\n")
        self._write_file("b.txt", "bbb\n")

        # both show as unstaged
        response = self.fetch("/api/status")
        payload = json.loads(response.body)
        self.assertIn("a.txt", self._unstaged_paths(payload))
        self.assertIn("b.txt", self._unstaged_paths(payload))

        # stage all
        resp = self.fetch(
            self.get_url("/api/stage-all"),
            method="POST",
            headers={"Content-Type": "application/json"},
            body=json.dumps({"action": "add"}),
        )
        self.assertEqual(resp.code, 200)

        # both moved to staged
        response = self.fetch("/api/status")
        payload = json.loads(response.body)
        self.assertNotIn("a.txt", self._unstaged_paths(payload))
        self.assertNotIn("b.txt", self._unstaged_paths(payload))
        self.assertIn("a.txt", self._staged_paths(payload))
        self.assertIn("b.txt", self._staged_paths(payload))

        # unstage all
        resp = self.fetch(
            self.get_url("/api/stage-all"),
            method="POST",
            headers={"Content-Type": "application/json"},
            body=json.dumps({"action": "remove"}),
        )
        self.assertEqual(resp.code, 200)

        # both no longer staged
        response = self.fetch("/api/status")
        payload = json.loads(response.body)
        self.assertNotIn("a.txt", self._staged_paths(payload))
        self.assertNotIn("b.txt", self._staged_paths(payload))


if __name__ == "__main__":
    tornado.testing.main()
