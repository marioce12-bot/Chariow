# Musique attribuée dans les diaporamas Vendeo

## Périmètre de cette intégration

Les 13 morceaux Scott Buckley dont les pages individuelles ont été vérifiées et les fichiers téléchargés dans `/workspace/Vendeo-musiques` sont intégrés au catalogue serveur. Les sept morceaux Kevin MacLeod non téléchargés ne sont pas intégrés.

Les fichiers originaux restent dans un stockage privé. Aucun MP3 n’est placé dans `public/`, exposé par le catalogue client ou proposé en téléchargement public séparé. Les aperçus sont des MP4 synchronisés avec un visuel Vendeo et les rendus sont des vidéos produit. Il ne s’agit pas d’un service de streaming musical ni d’une vente de pistes isolées.

## Sources et conditions

La page officielle [Using This Music](https://www.scottbuckley.com.au/library/using-this-music/) indique que les MP3 de la bibliothèque, sauf mention contraire, sont sous CC BY 4.0, et autorise les projets commerciaux avec attribution. Elle précise : « My music cannot be resold in isolation, or redistributed/reuploaded to music streaming platforms, and must be synchronised with other media (e.g. film). » Elle interdit aussi les soumissions aux systèmes d’empreintes audio, notamment Content ID, et exige le crédit dans la **description YouTube**, pas seulement dans la vidéo. Les remixes orchestraux qui réemploient d’autres œuvres ne font pas partie de cette sélection.

Le [résumé CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.en) autorise partage et adaptation, y compris commercialement, sous attribution, lien de licence et indication des modifications. Le [texte juridique](https://creativecommons.org/licenses/by/4.0/legalcode.en) précise qu’une musique synchronisée temporellement avec une image animée constitue une adaptation. La [FAQ officielle](https://www.scottbuckley.com.au/library/faq/) rappelle les conditions commerciales avec crédit.

L’absence du mot « SaaS » dans ces textes ne suffit pas à interdire l’usage synchronisé décrit ici. Cela n’équivaut toutefois pas à une assurance juridique de l’artiste pour toute bibliothèque SaaS à grande échelle. Une clarification écrite reste conseillée avant un déploiement général. Toute future fonction de téléchargement audio autonome, streaming de musique ou redistribution de pistes isolées demande une nouvelle vérification et n’est pas activée par ce code.

## Attribution et modifications

Chaque piste conserve titre, artiste, page source, lien de licence et crédit fourni par l’artiste. Le rendu et le remplacement musical doivent intégrer ce crédit dans les métadonnées MP4 et retourner un texte exportable visible dans l’interface. L’utilisateur doit joindre ce texte à la publication et le coller dans la description YouTube. Ne pas présenter ces pistes comme « sans attribution » ni suggérer que l’artiste approuve Vendeo ou ses produits.

Le texte exporté indique les changements réellement appliqués : découpe à la durée du diaporama, synchronisation, transcodage, ajustement de volume et éventuel fondu. Un remplacement de musique garde les images et le flux vidéo ; il met à jour l’attribution pour la nouvelle piste. Ne pas soumettre ces bandes-son à YouTube Content ID ou aux systèmes d’empreinte de Facebook via un distributeur musical.
