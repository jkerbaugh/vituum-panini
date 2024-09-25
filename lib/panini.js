import { resolve, relative, extname, basename, join } from "path";

import FastGlob from "fast-glob";
import fs from "fs";
import { normalizePath } from "vituum/utils/common.js";

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
    )}/**/*.{html,hbs}`;

    const files = await FastGlob.async(layoutGlob);

    for (var i in files) {
      const path = files[i];

      var ext = extname(path);
      var name = basename(path, ext);
      var file = fs.readFileSync(path);

      if (this.layouts[name]) {
        delete this.layouts[name];
      }

      this.options.pageLayouts[name] = name;
      this.layouts[name] = this.Handlebars.compile(file.toString());
    }
  }

  getLayout(layoutName) {
    const layout =
      (this.options.pageLayouts && this.options.pageLayouts[layoutName]) ||
      "default";

    return this.layouts[layout];
  }

  async loadBuiltInHelpers() {
    const glob = normalizePath(join(import.meta.dirname, "../helpers/**/*.js"));
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
    const helpersDir = resolve(
      this.options.root,
      this.options.helpers.directory
    );
    const glob = `${normalizePath(helpersDir)}/**/*.js`;

    const files = await FastGlob.async(glob);

    for (var i in files) {
      const path = files[i];
      const helperName = basename(path, extname(path));

      try {
        if (this.Handlebars.helpers[helperName]) {
          this.Handlebars.unregisterHelper[helperName];
        }

        const helper = await import(`file:${path}`);
        this.Handlebars.registerHelper(helperName, helper.default);
      } catch (e) {
        console.error("Failed to import handlebar helper %s", helperName, e);
      }
    }
  }

  async loadPageHelpers(page) {
    this.Handlebars.registerHelper("ifPage", function() {
      var params = Array.prototype.slice.call(arguments);
      var pages = Array.from(params.slice(0, -1));
      var options = params[params.length - 1];
  
      if(pages.includes(page))
        return options.fn(this);
  
      return '';
    });

    this.Handlebars.registerHelper("unlessPage", function() {
      var params = Array.prototype.slice.call(arguments);
      var pages = Array.from(params.slice(0, -1));
      var options = params[params.length - 1];
  
      if(!pages.includes(page))
        return options.fn(this);
  
      return '';
    });
  }

  async loadPartials() {
    const glob = `${normalizePath(
      resolve(this.options.root, this.options.partials.directory)
    )}/**/*.{html,hbs}`;

    const files = await FastGlob.async(glob);

    for (var i in files) {
      const path = resolve(this.options.root, files[i]);

      const partialDir = relative(
        this.options.root,
        this.options.partials.directory
      );
      const partialName = normalizePath(relative(partialDir, path));

      this.Handlebars.registerPartial(
        basename(partialName, extname(partialName)),
        fs.readFileSync(path).toString()
      );
    }
  }
}
