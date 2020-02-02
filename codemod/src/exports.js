const Utils = require('./utils');

const formatExports = (exports) => exports
  .map(itemExport => `module.exports.${itemExport} = ${itemExport};`)
  .join('\n');

module.exports.getExports = (filename) => {
  if (filename === 'Utils') {
    return formatExports(Utils.getFileFunctions(filename))
  }

  if (filename === 'Constants') {
    return formatExports(Utils.getConstants())
  }

  return formatExports([filename]);
}