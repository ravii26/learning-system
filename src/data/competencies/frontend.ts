import type { CompetencyMap } from './types';

export const frontend: CompetencyMap = {
  key: 'frontend',
  title: 'Frontend Development',
  aliases: ['frontend', 'front-end', 'front end', 'web development', 'react', 'javascript', 'html', 'css', 'ui development'],
  description: 'Building accessible, fast web interfaces with HTML, CSS, JavaScript and React.',
  competencies: [
    // Web foundations
    { key: 'fe-html', title: 'Semantic HTML', group: 'Web foundations', kind: 'build', importance: 'core', from: 'aware',
      summary: 'Structure pages with the right elements, forms and landmarks.' },
    { key: 'fe-css', title: 'CSS, the box model and cascade', group: 'Web foundations', kind: 'build', importance: 'core', from: 'aware',
      summary: 'Style pages, understand specificity, the box model and units.' },
    { key: 'fe-layout', title: 'Flexbox, Grid and responsive design', group: 'Web foundations', kind: 'build', importance: 'core', from: 'use', prerequisites: ['fe-css'],
      summary: 'Build layouts that work from phone to desktop.' },
    { key: 'fe-accessibility', title: 'Accessibility', group: 'Web foundations', kind: 'concept', importance: 'supporting', from: 'use', prerequisites: ['fe-html'],
      summary: 'Make interfaces usable with keyboard and screen readers.' },

    // JavaScript
    { key: 'fe-js-core', title: 'JavaScript fundamentals', group: 'JavaScript', kind: 'build', importance: 'core', from: 'aware',
      summary: 'Use types, functions, objects, arrays and modules fluently.' },
    { key: 'fe-js-closures', title: 'Scope, closures and this', group: 'JavaScript', kind: 'concept', importance: 'core', from: 'use', prerequisites: ['fe-js-core'],
      summary: 'Explain scope, closures and how this is bound.' },
    { key: 'fe-js-async', title: 'Async JavaScript and the event loop', group: 'JavaScript', kind: 'concept', importance: 'core', from: 'use', prerequisites: ['fe-js-core'],
      summary: 'Use promises and async/await, and explain the event loop.' },
    { key: 'fe-dom', title: 'The DOM and browser events', group: 'JavaScript', kind: 'build', importance: 'core', from: 'use', prerequisites: ['fe-js-core', 'fe-html'],
      summary: 'Manipulate the DOM and handle events, including delegation.' },
    { key: 'fe-typescript', title: 'TypeScript', group: 'JavaScript', kind: 'build', importance: 'supporting', from: 'build', prerequisites: ['fe-js-core'],
      summary: 'Type components and data, and read type errors.' },

    // React
    { key: 'fe-react-basics', title: 'React components, props and state', group: 'React', kind: 'build', importance: 'core', from: 'use', prerequisites: ['fe-js-core'],
      summary: 'Build components with props, state and lists.' },
    { key: 'fe-react-effects', title: 'Effects and the component lifecycle', group: 'React', kind: 'concept', importance: 'core', from: 'use', prerequisites: ['fe-react-basics', 'fe-js-closures'],
      summary: 'Use effects correctly, with dependencies and cleanup, and avoid stale closures.' },
    { key: 'fe-react-state-mgmt', title: 'State management and data fetching', group: 'React', kind: 'design', importance: 'core', from: 'build', prerequisites: ['fe-react-effects', 'fe-js-async'],
      summary: 'Decide where state lives; fetch, cache and sync server data.' },
    { key: 'fe-react-rendering', title: 'Rendering and performance', group: 'React', kind: 'concept', importance: 'supporting', from: 'build', prerequisites: ['fe-react-basics'],
      summary: 'Explain re-rendering, memoisation and when to optimise.' },
    { key: 'fe-routing-ssr', title: 'Routing, SSR and frameworks (Next.js)', group: 'React', kind: 'concept', importance: 'supporting', from: 'build', prerequisites: ['fe-react-basics'],
      summary: 'Explain client versus server rendering and use a framework router.' },

    // Engineering
    { key: 'fe-browser-performance', title: 'Web performance', group: 'Engineering', kind: 'concept', importance: 'supporting', from: 'build',
      summary: 'Measure and improve load and runtime performance (Core Web Vitals).' },
    { key: 'fe-testing', title: 'Frontend testing', group: 'Engineering', kind: 'build', importance: 'supporting', from: 'build', prerequisites: ['fe-react-basics'],
      summary: 'Write component and end-to-end tests.' },
    { key: 'fe-tooling', title: 'Build tooling and Git', group: 'Engineering', kind: 'build', importance: 'supporting', from: 'use',
      summary: 'Use npm, a bundler/dev server and Git day to day.' },
    { key: 'fe-project', title: 'Ship a real frontend project', group: 'Engineering', kind: 'build', importance: 'core', from: 'build',
      prerequisites: ['fe-layout', 'fe-react-state-mgmt'],
      summary: 'Build and deploy a complete app someone else can use.' },
  ],
};
