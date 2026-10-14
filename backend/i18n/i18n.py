import json
import locale
import os
from tools.file_io import read_text


BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def load_language_list(language):
    file_path = os.path.join(BASE_DIR, "locale", f"{language}.json")
    if not os.path.exists(file_path):
        file_path = os.path.join(BASE_DIR, "locale", "en_US.json")
    if os.path.exists(file_path):
        return json.loads(read_text(file_path))
    return {}


class I18nAuto:
    def __init__(self, language=None):
        if language in ["Auto", None]:
            language = locale.getdefaultlocale()[
                0
            ]  # getlocale can't identify the system's language ((None, None))
        locale_path = os.path.join(BASE_DIR, "locale", f"{language}.json")
        if not os.path.exists(locale_path):
            language = "en_US"
        self.language = language
        self.language_map = load_language_list(language)

    def __call__(self, key):
        return self.language_map.get(key, key)

    def __repr__(self):
        return "Use Language: " + self.language
