<?php

namespace forumaker\MagicRead;

use Flarum\Extend;

return [
    new Extend\Locales(__DIR__ . '/resources/locale'),

    (new Extend\Frontend('forum'))
        ->css(__DIR__ . '/resources/less/forum.less')
        ->js(__DIR__ . '/js/dist/forum.js'),

    (new Extend\Frontend('admin'))
        ->css(__DIR__ . '/resources/less/admin.less')
        ->js(__DIR__ . '/js/dist/admin.js'),

    (new Extend\Settings())
        ->default('forumaker-magicread.enable_counter', '1')
        ->default('forumaker-magicread.enable_readmore', '1')
        ->default('forumaker-magicread.enable_pagination', '1')
        ->default('forumaker-magicread.enable_discussion_pager', '0')

        ->serializeToForum('magicread_enable_counter', 'forumaker-magicread.enable_counter', 'boolval')
        ->serializeToForum('magicread_enable_readmore', 'forumaker-magicread.enable_readmore', 'boolval')
        ->serializeToForum('magicread_enable_pagination', 'forumaker-magicread.enable_pagination', 'boolval')
        ->serializeToForum('magicread_enable_discussion_pager', 'forumaker-magicread.enable_discussion_pager', 'boolval'),
];
