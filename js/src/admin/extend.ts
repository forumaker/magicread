import Extend from 'flarum/common/extenders';
import MagicReadPage from './components/MagicReadPage';

export default [
  new Extend.Admin().page(MagicReadPage),
];