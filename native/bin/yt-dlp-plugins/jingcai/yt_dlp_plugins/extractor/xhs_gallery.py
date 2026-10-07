from yt_dlp.extractor.xiaohongshu import XiaoHongShuIE
from yt_dlp.utils import js_to_json, ExtractorError
from yt_dlp.utils.traversal import traverse_obj


class _JingcaiXhsIE(XiaoHongShuIE, plugin_name='jingcai_gallery'):
    def _real_extract(self, url):
        note_id = self._match_id(url)
        page = self._download_webpage(url, note_id)
        state = self._search_json(r'window\.__INITIAL_STATE__\s*=', page,
                                  'initial state', note_id, transform_source=js_to_json)
        note = traverse_obj(state, ('note', 'noteDetailMap', note_id, 'note')) or {}
        if note.get('type') != 'normal':
            return super()._real_extract(url)
        images = []
        for item in note.get('imageList', []):
            src = item.get('urlDefault') or item.get('urlPre')
            if not src:
                raise ExtractorError('图集存在缺失图片地址，请重新获取', expected=True)
            images.append({'url': src.replace('http://', 'https://', 1),
                           'width': item.get('width'), 'height': item.get('height')})
        return {'id': note_id, 'title': note.get('title') or (note.get('desc') or '').split('\n')[0][:80] or f'小红书图集 {note_id}',
                'formats': [], 'gallery_images': images, 'media_kind': 'gallery'}
