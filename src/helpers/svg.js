import Handlebars from "handlebars";

export default function (path, options = {}) {
  if (typeof path !== "string") {
    throw new Error(
      "{{inlineSVG}} helper: invalid path. Path must be formatted as a string."
    );
  }

  var attrs = Object.keys(options.hash)
  .map(function(key) {
    return key + '="' + options.hash[key] + '"';
  })
  .join(" ");  

  return new Handlebars.SafeString(`<img src="/svgs/${path}.svg" ${attrs} />`);
};
