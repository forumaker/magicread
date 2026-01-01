import app from 'flarum/admin/app';
import MagicReadPage from './components/MagicReadPage';

app.initializers.add('forumaker-magicread', () => {
  app.extensionData.for('forumaker-magicread').registerPage(MagicReadPage);
});