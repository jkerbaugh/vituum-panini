import { resolve, relative, parse, extname, basename } from "path";
import fs from "fs";
import FastGlob from "fast-glob";
import lodash from "lodash";
import Handlebars from "handlebars";
import fm from "front-matter";
import stripBom from "strip-bom";



import {
  getPackageInfo,
  merge,
  pluginBundle,
  pluginMiddleware,
  pluginReload,
  pluginTransform,
  processData,
  normalizePath,
} from "vituum/utils/common.js";
import { renameBuildEnd, renameBuildStart } from "vituum/utils/build.js";

import * as handlebarHelpers from "./helpers";

console.log(handlebarHelpers)

const { name } = getPackageInfo(import.meta.url);

/**
 * @type {import('@vituum/vite-plugin-handlebars/types').PluginUserConfig}
 */
const defaultOptions = {
  reload: true,
  root: null,
  helpers: {},
  partials: {
    directory: './src/partials',
    extname: false,
  },
  layouts: {
    directory: './src/layouts',
    extname: false,
  },
  pageLayouts: [],
  globals: {
    format: "hbs",
  },
  data: ["src/data/**/*.json"],
  formats: ["hbs", "json.hbs", "json"],
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

  const output = {};
  let context = options.data
    ? processData(
        {
          paths: options.data,
          root: resolvedConfig.root,
        },
        options.globals
      )
    : options.globals;

    const layoutGlob = !options.layouts.directory
    ? `${normalizePath(options.root)}/**/*.hbs`
    : `${normalizePath(
        resolve(resolvedConfig.root, options.layouts.directory)
      )}/**/*.hbs`;

  let layouts = [];

  FastGlob.sync(layoutGlob)
    .map((entry) => resolve(resolvedConfig.root, entry))
    .forEach((path) => {
      var ext = extname(path);
      var name = basename(path, ext);
      var file = fs.readFileSync(path);
      layouts[name] = Handlebars.compile(file.toString());
    });

  const partialGlob = !options.partials.directory
    ? `${normalizePath(options.root)}/**/*.hbs`
    : `${normalizePath(
        resolve(resolvedConfig.root, options.partials.directory)
      )}/**/*.hbs`;


  FastGlob.sync(partialGlob)
    .map((entry) => resolve(resolvedConfig.root, entry))
    .forEach((path) => {
      const partialDir = options.partials.directory
        ? relative(resolvedConfig.root, options.partials.directory)
        : options.root;
      const partialName = normalizePath(relative(partialDir, path));

      Handlebars.registerPartial(
        options.partials.extname
          ? partialName
          : partialName.replace(".hbs", ""),
        fs.readFileSync(path).toString()
      );
    });

  if (options.helpers) {
    Object.keys(options.helpers).forEach((helper) => {
      Handlebars.registerHelper(helper, options.helpers[helper]);
    });
  }

  const page = fm(stripBom(content));
  const basePath = parse(initialFilename).name;

  const layout =
    page.attributes.layout ||
    (options.pageLayouts && options.pageLayouts[basePath]) ||
    "default";

  context.template = layout;

  return new Promise((resolve) => {
    try {
      const layoutTemplate = layouts[context.template];

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
        layout: layout,
        root: relative(resolvedConfig.base, "/"),
      });

      Handlebars.registerHelper(
        "ifpage",
        ifPage(context.page)
      );
      Handlebars.registerHelper(
        "unlesspage",
        unlessPage(context.page)
      );

      Handlebars.registerPartial("body", pageTemplate);

      output.content = layoutTemplate(
        context,
        options.handlebars.runtimeOptions
      );

      resolve(output);
    } catch (error) {
      output.error = error;

      resolve(output);
    }
  });
};

/**
 * @param {import('@vituum/vite-plugin-handlebars/types').PluginUserConfig} options
 * @returns [import('vite').Plugin]
 */
const plugin = (options = {}) => {
  let resolvedConfig;
  let userEnv;

  options = merge(defaultOptions, options);

  Handlebars.registerHelper("ifequal", handlebarHelpers.ifEqual);
  Handlebars.registerHelper("repeat", handlebarHelpers.repeat);
  Handlebars.registerHelper("svg", handlebarHelpers.svg);

  return [
    {
      name,
      config(userConfig, env) {
        userEnv = env;
      },
      configResolved(config) {
        resolvedConfig = config;

        if (!options.root) {
          options.root = config.root;
        }
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
