import { resolve, relative, parse, extname, basename, join } from "path";
import fs from "fs";
import FastGlob from "fast-glob";
import lodash from "lodash";
import Handlebars from "handlebars";
import fm from "front-matter";
import stripBom from "strip-bom";

import Panini from "./lib/panini.js";

import {
  merge,
  pluginBundle,
  pluginMiddleware,
  pluginReload,
  pluginTransform,
  processData,
  normalizePath,
  getPackageInfo,
} from "vituum/utils/common.js";

import { renameBuildEnd, renameBuildStart } from "vituum/utils/build.js";

const { name } = getPackageInfo(import.meta.url);

let panini = new Panini(Handlebars);

/**
 * @type {import('@vituum/vite-plugin-handlebars/types').PluginUserConfig}
 */
const defaultOptions = {
  reload: true,
  root: null,
  helpers: {
    directory: "helpers",
  },
  partials: {
    directory: "partials",
  },
  layouts: {
    directory: "layouts",
    extname: false,
  },
  pageLayouts: [],
  globals: {
    format: "hbs",
  },
  data: ["src/data/**/*.json"],
  formats: ["hbs", "json.hbs", "json", "js", "scss", "html"],
  handlebars: {
    compileOptions: {},
    runtimeOptions: {},
  },
  ignoredPaths: [],
};

const renderTemplate = async (
  { filename, server, resolvedConfig },
  content,
  options
) => {
  const initialFilename = filename.replace(".html", "");

  await panini.loadBuiltInHelpers(Handlebars);
  await panini.loadLayouts();
  await panini.loadPartials();
  await panini.loadProjectHelpers();

  let context = options.data
    ? processData(
        {
          paths: options.data,
          root: resolvedConfig.root,
        },
        options.globals
      )
    : options.globals;

  if(resolvedConfig.define && resolvedConfig.define.application){
    context = merge(context, JSON.parse(resolvedConfig.define.application));
  }

  context = merge(context, { root: resolvedConfig.base });

  const page = fm(stripBom(content));
  const basePath = basename(initialFilename, extname(initialFilename));

  const layoutName = page.attributes.layout || parse(initialFilename).name;

  const renderInternal = async () => {
    const output = {};

    try {
      const layoutTemplate = panini.getLayout(layoutName);

      if (!layoutTemplate) {
        if (layoutName === "default") {
          throw new Error(
            'Panini error: you must have a layout named "default".'
          );
        } else {
          throw new Error(
            'Panini error: no layout named "' + layoutName + '" exists.'
          );
        }
      }

      const pageTemplate = Handlebars.compile(
        page.body,
        options.handlebars.compileOptions
      );

      context = {
        ...context,
        ...page.attributes,
      };

      context = {
        ...context,
        page: basePath,
        layout: layoutName,
        root: resolvedConfig.base,
      };

      if(Handlebars.helpers["ifPage"])
        Handlebars.unregisterHelper("ifPage");

      Handlebars.registerHelper("ifPage", function() {
        var params = Array.prototype.slice.call(arguments);
        var pages = Array.from(params.slice(0, -1));
        var options = params[params.length - 1];
    
        if(pages.includes(basePath))
          return options.fn(this);
    
        return '';
      });
  
      if(Handlebars.helpers["unlessPage"])
        Handlebars.unregisterHelper("unlessPage");

      Handlebars.registerHelper("unlessPage", function() {
        var params = Array.prototype.slice.call(arguments);
        var pages = Array.from(params.slice(0, -1));
        var options = params[params.length - 1];
    
        if(!pages.includes(basePath))
          return options.fn(this);
    
        return '';
      });


      Handlebars.registerPartial("body", pageTemplate);

      output.content = layoutTemplate(
        context,
        options.handlebars.runtimeOptions
      );
    } catch (error) {
      console.error(error);
      output.error = error;
    }

    return output;
  };

  return await renderInternal();
};

/**
 * @param {import('@vituum/vite-plugin-handlebars/types').PluginUserConfig} options
 * @returns [import('vite').Plugin]
 */
const plugin = async (options = {}) => {
  let resolvedConfig;
  let userEnv;

  options = merge(defaultOptions, options);

  return [
    {
      name,
      config(userConfig, env) {
        userEnv = env;
      },
      async configResolved(config) {
        resolvedConfig = config;

        if (!options.root) {
          options.root = config.root;
        }

        panini.setOptions(options, resolvedConfig);
      },
      buildStart: async () => {
        if (
          userEnv.command !== "build" ||
          !resolvedConfig.build.rollupOptions.input
        ) {
          return;
        }

        await renameBuildStart(
          resolvedConfig.build.rollupOptions.input,
          options.formats
        );
      },
      buildEnd: async () => {
        if (
          userEnv.command !== "build" ||
          !resolvedConfig.build.rollupOptions.input
        ) {
          return;
        }

        await renameBuildEnd(
          resolvedConfig.build.rollupOptions.input,
          options.formats
        );
      },
      transformIndexHtml: {
        order: "pre",
        async handler(content, { path, filename, server }) {
          return pluginTransform(
            content,
            { path, filename, server },
            { name, options, resolvedConfig, renderTemplate }
          );
        },
      },
      handleHotUpdate: ({ file, server }) =>
        pluginReload({ file, server }, options),
    },
    pluginBundle(options.formats),
    pluginMiddleware(name, options.formats),
  ];
};

export default plugin;
