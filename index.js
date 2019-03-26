#!/usr/bin/env node

// File handling
const { promisify } = require('util');
const url = require('url')
const { basename, extname } = require('path')
const relative = require('@aredridel/url-relative')

// File parsing
const readFile = promisify(require('fs').readFile)
const unified = require('unified')
const markdown = require('remark-parse')

const parser = unified()
    .use(markdown)

const frontMatter = require('front-matter')

// Text parsing
const compromise = require('compromise')
const remark2text = require('remark-retext')
const retextStringify = require('retext-stringify')
const english = require('retext-english')
const pos = require('retext-pos')

const stripper = unified()
    .use(markdown)
    .use(remark2text, english.Parser)
    .use(pos)
    .use(retextStringify)

// Util
const uniq = require('array-uniq')
const wordWrap = require('word-wrap')

const storyweb = require('storyweb')

function unsmart(s) {
    return s.replace(/[“”]/, '"').replace(/[‘’]/, "'")
}


class WikiMap {
    constructor(root) {
        this.characters = []
        this.root = root
    }


    async run() {
        const repo = new storyweb.repo(this.root)
        const getAttributesFromVFile = async (file) => {
            const { body, attributes } = frontMatter(file.contents)
            const text = (await stripper.process(body)).toString()

            if ( attributes.characters ) {
                compromise.plugin({
                    words: attributes.characters.reduce((a, e) => ({ [e]: 'Person', ...a }), {})
                })
            }
            
            const characters = (
                attributes.characters
                ? attributes.characters
                : compromise(unsmart(text)).people().out('topk').filter(e => e.percent > 20).map(e => e.normal)
            )
                .map(e => e.replace(/^[a-z]/, l => l.toUpperCase()))

            this.characters = uniq(this.characters.concat(characters))

            return { ...attributes, characters }
        }

        const getLinksFromVFile = async (file) => {
            const { body } = frontMatter(file.contents)
            const ast = parser.parse(body)
            return getLinks(file, ast)
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
        for await (const el of repo) {
            map[el] = { children: await getLinksFromVFile(el), ...await getAttributesFromVFile(el) }
        }
        return map
    }
}

function mapToDot(root, map) {
    let out = "digraph {\n"
    out += `tooltip=" ";\n`
    out += `graph [fontname="inherit" bgcolor="transparent"];\n`
    out += `node [fontname="inherit" tooltip=" "];\n`
    out += `edge [fontname="inherit" tooltip=" "];\n`
    for (const [url, el] of Object.entries(map)) {
        const filename = decodeURIComponent((new URL(url)).pathname)
        const title = el.brief || el.title || basename(filename, extname(filename))
        const label = [`${title}\n`, el.characters ? el.characters.join(', ') : null]
            .filter(e=>e)
            .map(e => wordWrap(e, { width: 20, newline: "\n", indent: '', trim: true }))
            .join("\n")
        const href = relative(root, url)
        out += `"${url}" [label=${JSON.stringify(label)} href="${href}"];\n`
        if (el.children) {
            for (const child of el.children) {
                if (/^Prev/.test(child.text)) continue;
                const text = wordWrap(child.text, { width: 20, newline: "\n", indent: '', trim: true })
                const [, ,label] = (/(\()(.*?)(\))/.exec(text) || [])
                if (child.text.trim() == 'Next') {
                    out += `"${url}" -> "${child.url}";\n`
                } else if (label) {
                    out += `"${url}" -> "${child.url}" [label=${JSON.stringify(label)}];\n`
                } else {
                    out += `"${url}" -> "${child.url}" [label=${JSON.stringify(text)}];\n`
                }
                if (/\bAlt\b|\bAlternate\b/.test(child.text)) {
                    out += `{ rank = same; "${url}"; "${child.url}" }\n`
                }
            }
        } else {
            out += `"${url}" -> "${el.error}";\n`
        }
    }
    out += "}\n";
    return out;
}

if (!process.argv[2]) {
    console.warn(`use: ${process.argv.slice(1).join(' ')} filename`);
    process.exit(1);
}

const root = process.argv[2]

const map = new WikiMap(root)

map.run().then(e => mapToDot(root, e)).then(console.log, console.warn)
