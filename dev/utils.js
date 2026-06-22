import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const path_resolve = (...paths) => path.resolve(__dirname, ...paths)
const path_relative = (...paths) => path.relative(path_resolve('../'), ...paths)

const is_prod = process.argv.includes('--prod')

const config_path = path_resolve('../config.json')
const config = JSON.parse(fs.readFileSync(config_path, 'utf-8'))

const output_dir = is_prod ? path_resolve(`../satin-simgos-${config.version}`) : path_resolve('../public')

const log = (color_code, pre, content, ...misc) => console.log(`\x1b[${color_code}m%s\x1b[0m %s`, pre, content, ...misc)

const mkdir = (p, log_pre) => {
    if (!fs.existsSync(p)) {
        fs.mkdirSync(p, { recursive: true })
        if (log_pre) {
            log(32, log_pre, path_relative(p))
        }
    }
}

const copy_dir = (src, dest) => {
    if (!fs.existsSync(src)) return
    fs.mkdirSync(dest, { recursive: true })
    const entries = fs.readdirSync(src, { withFileTypes: true })
    for (let entry of entries) {
        const src_path = path.join(src, entry.name)
        const dest_path = path.join(dest, entry.name)
        if (entry.isDirectory()) {
            copy_dir(src_path, dest_path)
        } else {
            fs.copyFileSync(src_path, dest_path)
        }
    }
}

const rebounce_time = 100
const watch = (target_path, filter, callback) => {
    let can_rebuild = true
    const reset = () => (can_rebuild = true)
    fs.watch(target_path, { recursive: true }, async (ev, name) => {
        if (can_rebuild && name && filter(name)) {
            can_rebuild = false
            setTimeout(reset, rebounce_time)
            await callback(ev, name)
        }
    })
}

export {
    path_resolve,
    path_relative,
    output_dir,
    is_prod,
    config,
    log,
    mkdir,
    copy_dir,
    watch,
}
