"""Guards for the onboarding privacy warnings (issue #345).

A fork of a public repo cannot be private, and /setup writes personal data
into tracked files - a real user was bitten by discovering this only in
SETUP.md section 8, downstream of the decision. These tests pin that the
warning is complete and sits at the point of decision (Ghostwriter: the
README's "## Privacy" section; upstream SETUP.md: "## 2. Fork and clone"),
and that /setup checks the origin's visibility BEFORE writing anything.
"""
import re
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
README = REPO / "README.md"
SETUP_GUIDE = REPO / "SETUP.md"
SETUP_COMMAND = REPO / ".claude" / "commands" / "setup.md"


def section(text: str, heading: str) -> str:
    """Body of a markdown section up to the next heading of the same level."""
    level = heading.split(" ")[0]
    pattern = re.compile(
        rf"^{re.escape(heading)}\n(.*?)(?=^{level} |\Z)", re.MULTILINE | re.DOTALL
    )
    match = pattern.search(text)
    return match.group(1) if match else ""


class TestForkWarningsAtTheDecisionPoint(unittest.TestCase):
    def assert_warns(self, body: str, where: str):
        self.assertRegex(
            body,
            re.compile(r"public", re.IGNORECASE),
            f"{where}'s fork section must say the fork will be public",
        )
        self.assertIn(
            "personal data",
            body,
            f"{where}'s fork section must say /setup writes personal data into tracked files",
        )
        self.assertRegex(
            body,
            re.compile(r"section 8|§8|#8-pulling", re.IGNORECASE),
            f"{where}'s fork section must point at SETUP.md section 8's private-remote recipe",
        )

    def test_readme_warns_about_personal_data_and_a_public_repo(self):
        # Ghostwriter's README replaced upstream's "### 1. Fork and clone"
        # walkthrough with a dedicated "## Privacy" section; the warning must
        # still be there, complete, and it must carry the /setup wording.
        body = section(README.read_text(encoding="utf-8"), "## Privacy")
        self.assertTrue(body, "README must have a '## Privacy' section")
        self.assertIn("/setup", body, "the Privacy section must name /setup as what writes personal data")
        self.assert_warns(body, "README")

    def test_setup_guide_warns_next_to_the_fork_command(self):
        body = section(SETUP_GUIDE.read_text(encoding="utf-8"), "## 2. Fork and clone")
        self.assertIn("gh repo fork", body, "sanity: the fork command lives in this section")
        self.assert_warns(body, "SETUP.md")


class TestSetupChecksOriginBeforeWriting(unittest.TestCase):
    def test_preflight_exists_and_precedes_profile_generation(self):
        text = SETUP_COMMAND.read_text(encoding="utf-8")
        self.assertIn(
            "git remote get-url origin",
            text,
            "/setup must check where the working copy would publish to",
        )
        preflight_at = text.index("git remote get-url origin")
        writes_at = text.index("## Step 3: Generate Profile Files")
        self.assertLess(
            preflight_at,
            writes_at,
            "the origin check must run before any profile file is written - the "
            "existing Step 4 note fires after everything is already on disk",
        )
        self.assertIn(
            "public",
            text[max(0, preflight_at - 2000) : preflight_at + 2000].lower(),
            "the preflight must be about public visibility, not just remote presence",
        )


if __name__ == "__main__":
    unittest.main()
