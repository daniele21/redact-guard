"""Local model preference: Korgis owns catalog, artifacts and inference lifecycle."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.model_selection import (
    ModelCatalogUnavailable,
    ModelPreferenceError,
    get_selected_model,
    get_public_hardware,
    list_catalog_models,
    list_resident_models,
    select_available_model,
)

router = APIRouter()


class ModelSelectionRequest(BaseModel):
    model: str = Field(min_length=1, max_length=160)


class ModelChoice(BaseModel):
    model_id: str
    startup_key: str
    downloaded: bool
    resident: bool


class ResidentModelCatalog(BaseModel):
    selected_model: str
    models: list[str]
    choices: list[ModelChoice] = Field(default_factory=list)
    selected_resident: bool
    discovery_available: bool
    hardware: dict[str, str | int] | None = None


def _catalog(selected: str) -> ResidentModelCatalog:
    try:
        models = list_resident_models()
    except ModelCatalogUnavailable:
        return ResidentModelCatalog(
            selected_model=selected, models=[], choices=[],
            selected_resident=False, discovery_available=False,
        )
    try:
        choices = list_catalog_models()
    except ModelCatalogUnavailable:
        choices = []
    # The legacy first-launch preference may be a Korgis startup key rather
    # than its public OpenAI-compatible ID. Resolve it for UI display only.
    choice = next(
        (item for item in choices if item["startup_key"] == selected),
        None,
    )
    visible_selected = str(choice["model_id"]) if choice else selected
    resident = visible_selected in models or bool(choice and choice["resident"])
    return ResidentModelCatalog(
        selected_model=visible_selected, models=models, choices=choices,
        selected_resident=resident,
        discovery_available=True,
        hardware=get_public_hardware(visible_selected) if resident else None,
    )


@router.get("/local-models", response_model=ResidentModelCatalog)
def get_local_models():
    try:
        return _catalog(get_selected_model())
    except ModelPreferenceError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.put("/local-models/selection", response_model=ResidentModelCatalog)
def choose_local_model(request: ModelSelectionRequest):
    try:
        selected = select_available_model(request.model)
        return _catalog(selected)
    except ModelCatalogUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ModelPreferenceError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
