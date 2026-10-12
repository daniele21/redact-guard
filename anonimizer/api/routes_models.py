"""Model preference API. Discovery is read-only; selection never controls Korgis admin APIs."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.model_selection import (
    ModelCatalogUnavailable,
    ModelPreferenceError,
    get_selected_model,
    get_public_hardware,
    list_resident_models,
    select_resident_model,
)

router = APIRouter()


class ModelSelectionRequest(BaseModel):
    model: str = Field(min_length=1, max_length=160)


class ResidentModelCatalog(BaseModel):
    selected_model: str
    models: list[str]
    selected_resident: bool
    discovery_available: bool
    hardware: dict[str, str | int] | None = None


@router.get("/local-models", response_model=ResidentModelCatalog)
def get_local_models():
    try:
        selected = get_selected_model()
    except ModelPreferenceError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    try:
        models = list_resident_models()
    except ModelCatalogUnavailable:
        return ResidentModelCatalog(
            selected_model=selected,
            models=[],
            selected_resident=False,
            discovery_available=False,
        )
    return ResidentModelCatalog(
        selected_model=selected,
        models=models,
        selected_resident=selected in models,
        discovery_available=True,
        hardware=get_public_hardware(selected) if selected in models else None,
    )


@router.put("/local-models/selection", response_model=ResidentModelCatalog)
def choose_local_model(request: ModelSelectionRequest):
    try:
        selected = select_resident_model(request.model)
        models = list_resident_models()
    except ModelCatalogUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ModelPreferenceError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return ResidentModelCatalog(
        selected_model=selected,
        models=models,
        selected_resident=selected in models,
        discovery_available=True,
    )
