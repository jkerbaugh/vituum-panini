import {
    resolve,
    relative,
    extname,
    basename,
    join
} from "path";

import FastGlob from "fast-glob";
import fs from "fs";
import {
    normalizePath,
} from "vituum/utils/common.js";

export default class Panini {
    options = {};
    resolvedConfig = {};
    layouts = [];

    constructor(handlebars) {
        this.Handlebars = handlebars;
    }

    setOptions(options, resolvedConfig) {
        this.options = options;
        this.resolvedConfig = resolvedConfig;
    }

    async loadLayouts() {
        const layoutGlob = `${normalizePath(
            resolve(this.options.root, this.options.layouts.directory)
        )}/**/*.hbs`;


        const files = await FastGlob.async(layoutGlob);

        for (var i in files) {
            const path = files[i];

            var ext = extname(path);
            var name = basename(path, ext);
            var file = fs.readFileSync(path);

            if(this.layouts[name]){
                delete this.layouts[name];
            }
            
            this.layouts[name] = this.Handlebars.compile(file.toString());
        }
    }

    getLayout(layoutName) {
        const layout = (this.options.pageLayouts && this.options.pageLayouts[layoutName]) || "default";
        return this.layouts[layout];
    }


    async loadBuiltInHelpers() {
        const glob = normalizePath(join(import.meta.dirname, "helpers/**/*.js"));
        const files = await FastGlob.async(glob);

        for (var i in files) {
            const path = files[i];
            const helperName = basename(path, extname(path));
            const importPath = normalizePath(relative(import.meta.dirname, path));

            const helper = await import(`./${importPath}`);
            this.Handlebars.registerHelper(helperName, helper.default);
        }
    }

    async loadProjectHelpers() {
        const helpersDir = resolve(this.options.root, this.options.helpers.directory);
        const glob = `${normalizePath(helpersDir)}/**/*.js`;

        const files = await FastGlob.async(glob);

        for (var i in files) {
            try {
                const path = files[i];
                const helperName = basename(path, extname(path));

                if (this.Handlebars.helpers[helperName]) {
                   this.Handlebars.unregisterHelper[helperName];
                } 

                const helper = await import(`file:${path}`);
                this.Handlebars.registerHelper(helperName, helper.default);
            } catch (e) {
                console.error("Failed to import handlebar helper #%d", helperName);
            }
        }
    }

    async loadPageHelpers(page){
        const glob = normalizePath(join(import.meta.dirname, "page-helpers/**/*.js"));
        const files = await FastGlob.async(glob);

        for (var i in files) {
            const path = files[i];
            const helperName = basename(path, extname(path));
            const importPath = normalizePath(relative(import.meta.dirname, path));

            const helper = await import(`./${importPath}`);
            this.Handlebars.registerHelper(helperName, helper.default(page));
        }
    }

    async loadPartials() {
        const glob = `${normalizePath(
            resolve(this.options.root, this.options.partials.directory)
        )}/**/*.hbs`;

        const files = await FastGlob.async(glob);

        for (var i in files) {
            const path = resolve(this.options.root, files[i]);

            const partialDir = relative(this.options.root, this.options.partials.directory);
            const partialName = normalizePath(relative(partialDir, path));

            this.Handlebars.registerPartial(
                basename(partialName, extname(partialName)),
                fs.readFileSync(path).toString()
            );
        }
    }
}
