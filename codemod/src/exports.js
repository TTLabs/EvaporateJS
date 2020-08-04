const Utils = require('./utils');

const formatExports = (exports) => exports
  .map(itemExport => `${itemExport}`)
  .join(',\n');

const getFormatedExports = (filename) => {
  if (filename === 'Utils') {
    return formatExports(Utils.getFileFunctions(filename))
  }

  if (filename === 'Constants') {
    return formatExports(Utils.getConstants())
  }

  return formatExports([filename]);
}

module.exports.getExports = (filename) => {
  return `\nexport {\n${getFormatedExports(filename)}\n};`
}