import './polyfills';
import './styles.css';
import { render } from 'preact';
import { App } from './app';
import { installInput } from './input';
import { platform, registerMediaKeys } from './platform';

document.documentElement.setAttribute('data-platform', platform);
installInput();
registerMediaKeys();

render(<App />, document.getElementById('app')!);
