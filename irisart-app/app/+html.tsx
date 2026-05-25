// This file is web-only and used to configure the root HTML for every
// web page during static rendering.
// The contents of this function only run in Node.js environments and
// do not have access to the DOM or browser APIs.
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />

        <style dangerouslySetInnerHTML={{ __html: `${responsiveBackground}\n${webLayout}` }} />
        {/* Add any additional <head> elements that you want globally available on web... */}
      </head>
      <body>{children}</body>
    </html>
  );
}

const responsiveBackground = `
body {
  background-color: #fff;
}
@media (prefers-color-scheme: dark) {
  body {
    background-color: #000;
  }
}`;

/** Let React Native ScrollView fill the viewport and scroll on mobile web. */
const webLayout = `
html, body {
  height: 100%;
  margin: 0;
}
body {
  overflow: hidden;
}
#root {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  height: 100%;
  overflow: hidden;
}`;
