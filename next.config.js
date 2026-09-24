/** @type {import('next').NextConfig} */
module.exports = {
  // Lets a second dev server (e.g. a verification copy on another port) use
  // its own build folder instead of fighting over .next with the main one.
  distDir: process.env.NEXT_DIST_DIR || '.next',
};
