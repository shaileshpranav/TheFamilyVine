from tests.conftest import OWNER

DEFAULTS = {"theme": "system", "text_size": "normal", "start_page": "home"}


async def test_preferences_start_at_their_defaults(api):
    r = await api.as_(OWNER).get("/api/me")
    assert r.status_code == 200, r.text
    assert r.json()["preferences"] == DEFAULTS


async def test_each_preference_changes_on_its_own_and_is_kept(api):
    me = api.as_(OWNER)
    r = await me.patch("/api/me", {"preferences": {"theme": "dark"}})
    assert r.status_code == 200, r.text
    r = await me.patch("/api/me", {"preferences": {"start_page": "tree", "text_size": "large"}})
    assert r.json()["preferences"] == {"theme": "dark", "text_size": "large", "start_page": "tree"}
    assert (await me.get("/api/me")).json()["preferences"]["theme"] == "dark"

    # Other profile fields still update, and leave the settings alone.
    r = await me.patch("/api/me", {"display_name": "Owner"})
    assert r.json()["display_name"] == "Owner" and r.json()["preferences"]["theme"] == "dark"


async def test_unknown_settings_are_refused(api):
    me = api.as_(OWNER)
    assert (await me.patch("/api/me", {"preferences": {"theme": "purple"}})).status_code == 422
    assert (await me.patch("/api/me", {"preferences": {"start_page": "people"}})).status_code == 422
