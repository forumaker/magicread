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
        ->default('forumaker-magicread.enable_counter', true)
        ->default('forumaker-magicread.enable_pagination', true)
        ->default('forumaker-magicread.per_page', 20)
        ->default('forumaker-magicread.enable_readmore', true)
        ->default('forumaker-magicread.enable_discussion_pager', false)

        ->serializeToForum('magicread_enable_counter', 'forumaker-magicread.enable_counter', fn ($v) => (bool) $v)
        ->serializeToForum('magicread_enable_pagination', 'forumaker-magicread.enable_pagination', fn ($v) => (bool) $v)
        ->serializeToForum('magicread_per_page', 'forumaker-magicread.per_page', fn ($v) => (int) $v)
        ->serializeToForum('magicread_enable_readmore', 'forumaker-magicread.enable_readmore', fn ($v) => (bool) $v)
        ->serializeToForum('magicread_enable_discussion_pager', 'forumaker-magicread.enable_discussion_pager', fn ($v) => (bool) $v),
];