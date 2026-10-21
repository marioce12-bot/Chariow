# Catalogue musical de préparation vidéo

La recherche est alimentée en direct par l’API publique de Wikimedia Commons (`https://commons.wikimedia.org/w/api.php`). L’application ne collecte pas de fichiers en lot et ne stocke pas les audios : la recherche lit uniquement des métadonnées publiques, et l’aperçu ne charge un flux audio que lorsque l’utilisateur clique sur un morceau. La recherche n’accepte aucune URL fournie par l’utilisateur et utilise un délai d’expiration par requête.

La recherche Commons est préfiltrée avec `filetype:audio`, la catégorie `Audio_files_of_music` et des déclarations de licence CC0 / domaine public dans le contenu des pages (`insource:`). Les résultats sont ensuite validés avec les métadonnées propres au fichier : CC0 ou Public domain, média de type audio, et URL HTTPS hébergées par les domaines Wikimedia attendus. Commons peut déclarer un flux OGG avec le MIME `application/ogg` ; dans ce cas le champ `mediatype=AUDIO` de l’API permet de distinguer l’audio d’un média vidéo. Les licences CC BY/SA ne sont pas retenues. La pagination est bornée à trois pages de résultats afin d’éviter une collecte illimitée.

La disponibilité dépend des termes de recherche, des catégories et des modèles de licence employés dans Commons ; le catalogue ne garantit aucun nombre de morceaux et peut ne fournir aucun résultat approprié. L’application n’invente pas de titres. L’attribution est construite à partir du titre, de l’auteur et de la licence, avec la métadonnée `Attribution` si elle existe ; le champ booléen `AttributionRequired` n’est pas traité comme une mention d’attribution.

Les sources établissent que Commons n’accepte que du contenu librement licencié ou domaine public, avec conditions propres à chaque licence ; les fichiers doivent indiquer leur licence, source et créateur. Pour un enregistrement musical, les droits sur la composition, les paroles, l’interprétation et l’enregistrement peuvent être distincts. Le filtre automatique est donc une précaution technique, pas une vérification juridique ni une garantie de droits. L’interface renvoie vers la page du fichier pour examen humain.

La syntaxe de préfiltrage (`insource:`) a été vérifiée via des requêtes publiques à l’API : la recherche CC0 a renvoyé des fichiers audio dont les métadonnées indiquaient CC0 ou domaine public, notamment plusieurs OGG avec `mime=application/ogg` et `mediatype=AUDIO`. La recherche non filtrée pour `piano` renvoyait en premier des enregistrements CC BY-SA, ce qui motive le filtre préalable. Les requêtes d’essai n’ont demandé que les champs de métadonnées (`url|mime|mediatype|extmetadata`) ; aucun audio n’a été téléchargé.

Sources consultées le 21 octobre 2026 :

- [Politique de licences de Wikimedia Commons](https://commons.wikimedia.org/wiki/Commons:Licensing)
- [Réutiliser du contenu Wikimedia Commons hors Wikimedia](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia)
- [Réutilisation des sons libres sur Commons](https://commons.wikimedia.org/wiki/Commons:Free_media_resources/Sound)
- [API MediaWiki Imageinfo](https://www.mediawiki.org/wiki/API:Imageinfo)
- [API MediaWiki Search](https://www.mediawiki.org/wiki/API:Search)
- [CC0 1.0 — résumé officiel Creative Commons](https://creativecommons.org/publicdomain/zero/1.0/deed.en)
