"""The weekly recipe page: its starting file must stand alone and print one recipe per page, and
the instructions must point at it. Offline; reads only files in the repo."""
import os
import re
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKILL = os.path.join(ROOT, ".claude", "skills", "martha")


def read(*parts):
    with open(os.path.join(*parts), encoding="utf-8") as f:
        return f.read()


class RecipePageTemplate(unittest.TestCase):
    def setUp(self):
        raw = read(SKILL, "recipe-page-template.html")
        self.assertIn("<!--", raw, "the file should open with a note on how to use it")
        self.html = re.sub(r"<!--.*?-->", "", raw, flags=re.S)  # the note is not part of the page
        self.style = re.search(r"<style>(.*?)</style>", self.html, re.S).group(1)

    def test_it_loads_nothing_from_outside(self):
        """No script, stylesheet, image, font or frame: the page works offline and prints as it is."""
        for tag in ("<script", "<link", "<img", "<iframe", "<object", "<embed", "<video", "<audio"):
            self.assertNotIn(tag, self.html.lower(), f"{tag} would load or run something")
        self.assertNotIn("@import", self.style)
        self.assertNotIn("url(", self.style)
        self.assertNotIn("@font-face", self.style)
        self.assertNotRegex(self.html.lower(), r"\ssrc\s*=")

    def test_the_only_addresses_are_links_to_a_source(self):
        hrefs = re.findall(r'href="([^"]+)"', self.html)
        self.assertTrue(hrefs, "the credit line needs a link to the original recipe")
        for h in hrefs:
            self.assertRegex(h, r"^https://example\.com/", "the template links only to a made-up source")
        body = self.html.split("</style>", 1)[1]
        self.assertEqual(len(re.findall(r"<a\s", body)), len(hrefs))

    def test_each_recipe_starts_a_new_printed_page(self):
        printed = re.search(r"@media print\s*\{(.*)\}\s*$", self.style, re.S)
        self.assertIsNotNone(printed, "no print rules")
        rules = printed.group(1)
        self.assertRegex(rules, r"\.recipe\s*\{[^}]*break-before:\s*page")
        self.assertRegex(rules, r"\.recipe\s*\{[^}]*page-break-before:\s*always")
        self.assertNotRegex(rules, r"\.prep\s*\{[^}]*break-before", "the prep plan stays on the first page")
        self.assertIn("@page", rules)

    def test_the_prep_plan_comes_before_the_recipes(self):
        prep, recipe = self.html.find('class="prep"'), self.html.find('class="recipe"')
        self.assertTrue(0 < prep < recipe)

    def test_a_recipe_has_every_part_in_order(self):
        section = self.html[self.html.find('class="recipe"'):]
        at = [section.find(part) for part in
              ("<h2>", 'class="meta"', "<h3>Ingredients</h3>", "<h3>Steps</h3>",
               "<h3>For each person</h3>", "<h3>Keeps</h3>", 'class="source"')]
        self.assertNotIn(-1, at, "a part of the recipe is missing")
        self.assertEqual(at, sorted(at), "the parts are out of order")

    def test_it_is_one_complete_page(self):
        low = self.html.lower()
        self.assertTrue(low.lstrip().startswith("<!doctype html>"))
        for tag in ("html", "head", "body", "main", "style", "section", "ol", "ul"):
            self.assertEqual(low.count(f"<{tag}>") + low.count(f"<{tag} "), low.count(f"</{tag}>"), tag)
        self.assertIn('<meta charset="utf-8">', low)


class RecipePageInstructions(unittest.TestCase):
    def setUp(self):
        self.skill = read(SKILL, "SKILL.md")

    def test_the_instructions_name_the_starting_file_and_the_weekly_file(self):
        self.assertIn("### The recipe page (every week)", self.skill)
        self.assertIn("recipe-page-template.html", self.skill)
        self.assertIn("outputs/martha-recipes-YYYY-MM-DD.html", self.skill)

    def test_the_recipe_page_is_made_before_the_email_that_attaches_it(self):
        page, mail = self.skill.find("### The recipe page"), self.skill.find("### The plan email")
        self.assertTrue(0 < page < mail)
        self.assertIn("martha-recipes-YYYY-MM-DD.html", self.skill[mail:])

    def test_steps_are_never_copied_or_invented(self):
        self.assertIn("Never copy a site's wording", self.skill)
        self.assertIn("Never invent ingredients", self.skill)

    def test_the_example_settings_and_the_readme_mention_it(self):
        self.assertIn("| Recipe page (always) |", read(SKILL, "config-example.md"))
        self.assertIn("Writes the recipes out for you", read(ROOT, "README.md"))


if __name__ == "__main__":
    unittest.main()
