Storymap
========

A small tool for understanding the structure of interlinked markdown files. (I use it for writing fiction)


Use
----

Run this tool on an index or entry point file in a folder full of markdown. It will output a graphviz file with a map of the story.

The tool does some limited natural language work to detect character names. It is unlikely to find any interesting (in a very white US ethnocentric sort of way) names, so it also uses a `characters` key in the front matter of any markdown it finds.

Markdown Front Matter Schema
-----------------------------

- `characters` (Array): A list of characters in a scene/chapter.
- `brief` (String): A brief (4 word or so) description of the scene/chapter.
- `title` (String): A title for the file
- `pov` (String): The viewpoint character for the scene/chapter.
