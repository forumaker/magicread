import app from 'flarum/admin/app';
import ExtensionPage from 'flarum/admin/components/ExtensionPage';

function Section(iconClass: string, titleKey: string, ...children: any[]) {
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

  saveSettings(e: SubmitEvent) {
    if (this.setting('forumaker-magicread.enable_discussion_pager')() === '1') {
      this.setting('forumaker-magicread.enable_pagination')('0');
    }
    return super.saveSettings(e);
  }

  content() {
    const discussionPagerOn = this.setting('forumaker-magicread.enable_discussion_pager')() === '1';

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
              help: app.translator.trans('forumaker-magicread.admin.settings.enable_readmore_help'),
            })
          ),
          m(
            'div.Form-group',
            this.buildSettingComponent({
              type: 'boolean',
              setting: 'forumaker-magicread.enable_counter',
              label: app.translator.trans('forumaker-magicread.admin.settings.enable_counter'),
              help: app.translator.trans('forumaker-magicread.admin.settings.enable_counter_help'),
            })
          )
        ),

        Section(
          'fas fa-book-open',
          'forumaker-magicread.admin.settings.section_pagination',
          m(
            'div.Form-group',
            this.buildSettingComponent({
              type: 'boolean',
              setting: 'forumaker-magicread.enable_discussion_pager',
              label: app.translator.trans('forumaker-magicread.admin.settings.enable_discussion_pager'),
              help: app.translator.trans('forumaker-magicread.admin.settings.enable_discussion_pager_help'),
            })
          ),
          m(
            'div.Form-group',
            this.buildSettingComponent({
              type: 'boolean',
              setting: 'forumaker-magicread.enable_pagination',
              label: app.translator.trans('forumaker-magicread.admin.settings.enable_pagination'),
              help: app.translator.trans('forumaker-magicread.admin.settings.enable_pagination_help'),
              disabled: discussionPagerOn,
            })
          )
        ),

        m('div.Form-group', this.submitButton())
      )
    );
  }
}
