import app from 'flarum/admin/app';
import ExtensionPage from 'flarum/admin/components/ExtensionPage';

function Section(iconClass, titleKey, ...children) {
  return m(
    'section.MagicRead-SettingsSection',
    m('h3', [
      m('i', { className: iconClass, 'aria-hidden': 'true' }),
      m('span', ' ' + app.translator.trans(titleKey)),
    ]),
    m('div.MagicRead-SettingsSection-content', children)
  );
}

export default class MagicReadPage extends ExtensionPage {
  className() {
    return 'MagicReadPage';
  }

  content() {
    return m(
      'div.MagicReadPage',
      m(
        'div.MagicReadPage-content',
        Section(
          'fas fa-book',
          'forumaker-magicread.admin.settings.section_main',
          m(
            'div.Form-group',
            this.buildSettingComponent({
              type: 'boolean',
              setting: 'forumaker-magicread.enable_readmore',
              label: app.translator.trans('forumaker-magicread.admin.settings.enable_readmore'),
            })
          ),
          m(
            'div.Form-group',
            this.buildSettingComponent({
              type: 'boolean',
              setting: 'forumaker-magicread.enable_pagination',
              label: app.translator.trans('forumaker-magicread.admin.settings.enable_pagination'),
            })
          ),
          m(
            'div.Form-group',
            this.buildSettingComponent({
              type: 'boolean',
              setting: 'forumaker-magicread.enable_counter',
              label: app.translator.trans('forumaker-magicread.admin.settings.enable_counter'),
            })
          )
        ),
        m('div.Form-group', this.submitButton())
      )
    );
  }
}