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
  getPackageInfo
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
    directory: 'helpers'
  },
  partials: {
    directory: 'partials',
  },
  layouts: {
    directory: 'layouts',
    extname: false,
  },
  pageLayouts: [],
  globals: {
    format: "hbs",
  },
  data: ["src/data/**/*.json"],
  formats: ["hbs", "json.hbs", "json", 'js', 'scss'],
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


  let context = options.data
    ? processData(
        {
          paths: options.data,
          root: resolvedConfig.root,
        },
        options.globals
      )
    : options.globals;


  await panini.loadBuiltInHelpers();
  await panini.loadLayouts();
  await panini.loadPartials();
  await panini.loadProjectHelpers();

  const page = fm(stripBom(content));
  const basePath = basename(initialFilename, extname(initialFilename));

  const layoutName = page.attributes.layout || parse(initialFilename).name;
  context.template = layoutName;

  const renderInternal = async () => {
    const output = {};

    try {
      const layoutTemplate = panini.getLayout(layoutName)

      if (!layoutTemplate) {
        if (layout === "default") {
          throw new Error(
            'Panini error: you must have a layout named "default".'
          );
        } else {
          throw new Error(
            'Panini error: no layout named "' + layout + '" exists.'
          );
        }
      }

      const pageTemplate = Handlebars.compile(
        page.body,
        options.handlebars.compileOptions
      );

      context = lodash.extend(context, page.attributes);

      context = lodash.extend(context, {
        page: basePath,
        root: resolvedConfig.base,
      });

      
      await panini.loadPageHelpers(context.page)

      Handlebars.registerPartial("body", pageTemplate);

      output.content = layoutTemplate(
        context,
        options.handlebars.runtimeOptions
      );
    } catch (error) {
      output.error = error;
    }

    return output;
  }

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
