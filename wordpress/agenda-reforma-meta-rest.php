<?php
/**
 * Plugin Name: Agenda Reforma — Permitir meta via REST
 * Description: Autoriza a escrita, pela REST API, dos campos meta protegidos (prefixo "_")
 *              do post type Agenda Reforma Íntima, para usuários que podem editar posts.
 *              Sem isto, o WordPress retorna 403 (rest_cannot_update) ao gravar esses campos.
 * Author: Thiago Mourão — https://github.com/MouraoBSB
 * Version: 1.0.0
 *
 * Como usar:
 *  - Opção mu-plugin: coloque este arquivo em wp-content/mu-plugins/ (ativa sozinho).
 *  - Opção Code Snippets: copie apenas o corpo do add_action abaixo para um novo snippet.
 */

if (!defined('ABSPATH')) {
    exit;
}

add_action('init', function () {
    $tipo = 'agenda-reforma';
    $campos = [
        '_dia_agenda',
        '_reflexao',
        '_mes_titulo',
        '_mes_texto',
        '_titulo_meta_dia',
        '_dia',
        '_prece',
        '_imagem',
        '_texto_imagem',
        '_tema',
    ];

    // Libera a escrita via REST apenas para quem pode editar posts.
    $autorizar = function ($permitido, $chave, $post_id, $user_id) {
        return user_can($user_id, 'edit_posts');
    };

    foreach ($campos as $campo) {
        // Filtro genérico e o específico do subtipo (post type). O específico tem
        // precedência no map_meta_cap, por isso ambos são necessários.
        add_filter("auth_post_meta_{$campo}", $autorizar, 99, 4);
        add_filter("auth_post_{$tipo}_meta_{$campo}", $autorizar, 99, 4);
    }
}, 99);
