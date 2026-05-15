"""
API routes for PII profile management and custom type CRUD.
"""

from fastapi import APIRouter, HTTPException
from domain.models import CustomTypeRequest, ProfileSummary, ProfileDetail, PIITypeDefinition
from services import profile_service

router = APIRouter()


# ---------------------------------------------------------------------------
# Custom PII types CRUD
# ---------------------------------------------------------------------------

@router.get("/profiles/custom-types", response_model=list[PIITypeDefinition])
def list_custom_types():
    """List all user-defined custom PII types."""
    return profile_service.load_custom_types()


@router.post("/profiles/custom-types", response_model=PIITypeDefinition, status_code=201)
def add_custom_type(body: CustomTypeRequest):
    """Add a new custom PII type with a name and description."""
    try:
        return profile_service.add_custom_type(name=body.name, description=body.description)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


@router.delete("/profiles/custom-types/{name}")
def remove_custom_type(name: str):
    """Remove a custom PII type by name."""
    removed = profile_service.remove_custom_type(name)
    if not removed:
        raise HTTPException(status_code=404, detail=f"Custom type '{name}' not found")
    return {"removed": name}


# ---------------------------------------------------------------------------
# Profile listing and detail
# ---------------------------------------------------------------------------

@router.get("/profiles", response_model=list[ProfileSummary])
def list_profiles():
    """List all available PII detection profiles."""
    return profile_service.list_profiles()


@router.get("/profiles/{name}", response_model=ProfileDetail)
def get_profile(name: str):
    """Get full detail of a specific profile including all PII types."""
    try:
        return profile_service.load_profile(name)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Profile '{name}' not found")
