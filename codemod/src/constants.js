const IgnoredNewExpressions = [
  'Date', 
  'Promise', 
  'XMLHttpRequest', 
  'Uint8Array', 
  'RegExp',
  'FileReader',
  'URL'
]

const TransformsToApply = [
  "arrow",
  "arrow-return",
  "for-of",
  "for-each",
  "arg-rest",
  "obj-method",
  "obj-shorthand",
  "no-strict",
  "exponent",
  "multi-var",
  "let",
  "class",
  "commonjs",
  "template",
  "default-param",
  "includes"
];

module.exports.TransformsToApply = TransformsToApply;
module.exports.IgnoredNewExpressions = IgnoredNewExpressions;
