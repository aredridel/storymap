import url from "url";
import fs from "fs";
import frontMatter from 'front-matter';

import uniq from 'array-uniq';
// File parsing
import unified from 'unified';
import markdown from 'remark-parse';

// Text parsing
import compromise from 'compromise'
import remark2text from 'remark-retext'
import retextStringify from 'retext-stringify'
import english from 'retext-english'
import pos from 'retext-pos'

const parser = unified()
    .use(markdown)

const stripper = unified()
    .use(markdown)
    .use(remark2text, english.Parser)
    .use(pos)
    .use(retextStringify)

const readFile = fs.promises.readFile;

export default class WikiMap {
    constructor() {
        this.characters = []
    }

    async run(start) {
        const getAttributesFromURL = async (u) => {
            const path = url.fileURLToPath(u)
            const file = await readFile(path, 'utf-8')
            const { body, attributes } = frontMatter(file)
            const text = (await stripper.process(body)).toString()

            if ( attributes.characters ) {
                compromise.plugin({
                    words: [].concat(attributes.characters).reduce((a, e) => ({ [e]: 'Person', ...a }), {})
                })
            }
            
            const characters = (
                attributes.characters
                ? [].concat(attributes.characters)
                : compromise(unsmart(text)).people().out('topk').filter(e => e.percent > 20).map(e => e.normal)
            )
                .map(e => e.replace(/^[a-z]/, l => l.toUpperCase()))

            this.characters = uniq(this.characters.concat(characters))

            return { ...attributes, characters }
        }

        const getLinksFromURL= async (u) => {
            const path = url.fileURLToPath(u)
            const file = await readFile(path, 'utf-8')
            const { body } = frontMatter(file)
            const ast = parser.parse(body)
            return getLinks(u, ast)
        }

        function getLinks(u, ast) {
            if (ast.type == 'link') {
                return [{url: url.resolve(u, ast.url), text: ast.children[0].value}]
            } else if (ast.children) {
                return ast.children.map(e => getLinks(u, e)).reduce((a, e) => a.concat(e), [])
            } else {
                return []
            }
        }
        const seen = new Set;
        const map = {};
        let queue = [...start];
        let el;
        while (el = queue.pop()) {
            el = String(el)
            if (seen.has(el) || (new URL(el)).protocol != 'file:') continue;
            seen.add(el)
            try {
                map[el] = { children: await getLinksFromURL(el), ...await getAttributesFromURL(el) }
                queue = queue.concat(map[el].children.map(e => url.resolve(el, e.url)))
            } catch (e) {
                if (e.code != 'ENOENT') throw e;
                map[el] = { error: 'ENOENT' }
            }
        }
        return map
    }
}

function unsmart(s) {
    return s.replace(/[“”]/, '"').replace(/[‘’]/, "'")
}

