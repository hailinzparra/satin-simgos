import fs from 'fs'
import path from 'path'
import ts from 'typescript'
import * as sass from 'sass'
import {
    path_resolve,
    path_relative,
    output_dir,
    is_prod,
    config,
    log,
    mkdir,
    copy_dir,
    watch,
} from './utils.js'

const build_manifest = () => {
    log(36, 'i manifest:', 'generating manifest.json')
    const manifest = {
        "manifest_version": 3,
        "name": config.name,
        "version": config.version,
        "description": config.description,
        "permissions": ["tabs", "storage", "scripting", "activeTab"],
        "host_permissions": config.targets,
        "content_scripts": [
            {
                "matches": config.targets,
                "js": [
                    "assets/lib/tailwind.min.js",
                    "assets/lib/lz-string.min.js",
                    "assets/lib/sweetalert2.all.min.js",
                    "assets/lib/firebase-app-compat.js",
                    "assets/lib/firebase-database-compat.js",
                    "assets/js/database.js",
                    "assets/js/content.js"
                ],
                "run_at": "document_end"
            }
        ],
        "action": {
            // "default_popup": "popup.html",
            "default_icon": {
                "16": "assets/img/icon16.png",
                "48": "assets/img/icon48.png",
                "128": "assets/img/icon128.png"
            }
        },
        "background": {
            "service_worker": "assets/js/background.js"
        },
        "icons": {
            "16": "assets/img/icon16.png",
            "48": "assets/img/icon48.png",
            "128": "assets/img/icon128.png"
        }
    }

    mkdir(output_dir)
    const dest_file = path.join(output_dir, 'manifest.json')
    fs.writeFileSync(dest_file, JSON.stringify(manifest, null, 2))
    log(32, '+ manifest:', path_relative(dest_file))
}

const build_scss = () => {
    const scss_dir = path_resolve('../src/scss')
    if (!fs.existsSync(scss_dir)) return

    const files = fs.readdirSync(scss_dir).filter(name => /\.scss$/i.test(name) && !name.startsWith('_'))
    const css_out_dir = path.join(output_dir, 'assets/css')
    mkdir(css_out_dir)

    files.forEach(file => {
        const src_file = path.join(scss_dir, file)
        const dest_file = path.join(css_out_dir, file.replace(/\.scss$/i, '.css'))

        try {
            const result = sass.compile(src_file, {
                style: is_prod ? 'compressed' : 'expanded'
            })
            fs.writeFileSync(dest_file, result.css)
            log(32, '+ scss:', path_relative(dest_file))
        } catch (err) {
            log(31, 'x scss error:', err.message)
        }
    })
}

const prerender_html = (lines, tag_name, tag_dir) => {
    const tags = []

    // extract tags
    for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].indexOf(`<insert-${tag_name}`) > -1) {
            if (lines[i].indexOf('<!--') < 0) {
                tags.push({
                    i,
                    line: lines[i],
                })
            }
        }
    }

    tags.forEach(tag => {
        // replace tag with the requested content
        const file_name = tag.line
            .split(`<insert-${tag_name}-`)[1]
            .split(' />')[0]

        const file_path = path_resolve(
            `../src/${tag_dir}/`,
            `${file_name}.html`
        )

        if (fs.existsSync(file_path)) {
            const file_text = fs
                .readFileSync(file_path)
                .toString()

            lines.splice(tag.i, 1, ...file_text.split('\n'))
        }
    })
}

const build_html = async () => {
    const html_src_dir = path_resolve('../src/html')
    if (!fs.existsSync(html_src_dir)) return

    const app_to_build = fs
        .readdirSync(html_src_dir, { recursive: true })
        .filter(name => /\.html$/i.test(name))

    log(
        36,
        'i html:',
        `building ${app_to_build.length} file${app_to_build.length === 1 ? '' : 's'}`
    )

    app_to_build.forEach((app_filename) => {
        const p = path.join(html_src_dir, app_filename)
        if (fs.existsSync(p)) {
            let app_text = fs.readFileSync(p).toString()

            let app_lines = app_text.split('\n')
            prerender_html(app_lines, 'content', 'contents')
            prerender_html(app_lines, 'template', 'templates')
            // component inside component inside component will be rendered (max 3 call stack)
            prerender_html(app_lines, 'component', 'components')
            prerender_html(app_lines, 'component', 'components')
            prerender_html(app_lines, 'component', 'components')
            app_text = app_lines.join('')

            app_text = app_text.replace(/{{VERSION}}/g, config.version)
            app_text = app_text.replace(/{{NAME}}/g, config.name)

            const build_path = path.join(output_dir, app_filename)

            mkdir(path.dirname(build_path), '+ dir')

            fs.writeFileSync(build_path, app_text)
            log(32, '+ html:', path_relative(build_path))
        }
    })
}

const start = async () => {
    log(36, 'i dev:', is_prod ? 'start production packaging workflow' : 'start development runtime')

    build_manifest()
    build_scss()
    await build_html()

    if (is_prod) {
        log(35, 'i prod:', `exporting production bundle to satin-simgos-${config.version}/`)

        const tsconfigPath = ts.findConfigFile(path_resolve('../'), ts.sys.fileExists, 'tsconfig.json')
        const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile)
        const parsedCommandLine = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path_resolve('../'))

        parsedCommandLine.options.outDir = path.join(output_dir, 'assets/js')
        parsedCommandLine.options.removeComments = true

        const program = ts.createProgram(parsedCommandLine.fileNames, parsedCommandLine.options)
        program.emit()
        log(32, '+ ts:', 'production scripts compiled successfully.')

        const prodImgDest = path.join(output_dir, 'assets/img')
        copy_dir(path_resolve('../public/assets/img'), prodImgDest)
        log(32, '+ sync:', 'production visual asset dependencies synchronized.')
        log(35, 'SUCCESS:', 'production environment package generated successfully.')
    } else {
        log(36, 'i ts:', 'start watching scripts')
        ts.createWatchProgram(
            ts.createWatchCompilerHost(
                ts.findConfigFile(path_resolve('../'), ts.sys.fileExists, 'tsconfig.json'),
                { outDir: path.join(output_dir, 'assets/js') },
                ts.sys,
                ts.createSemanticDiagnosticsBuilderProgram,
                diag => console.error('TS Error', diag.code, ':', ts.flattenDiagnosticMessageText(diag.messageText, ts.sys.newLine)),
                diag => log(34, 'i ts compiler:', ts.formatDiagnostic(diag, {
                    getCanonicalFileName: path => path,
                    getCurrentDirectory: ts.sys.getCurrentDirectory,
                    getNewLine: () => ts.sys.newLine,
                }).trim())
            )
        )

        watch(
            path_resolve('../src'),
            (name) => /\.html$/i.test(name),
            async () => {
                await build_html()
            }
        )

        watch(
            path_resolve('../src/scss'),
            (name) => /\.scss$/i.test(name),
            () => {
                build_scss()
            }
        )
    }
}

await start()
