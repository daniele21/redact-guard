"""Local job control plane. No detached process or administrative Korgis API."""
from fastapi import APIRouter
from pydantic import BaseModel, Field

from domain.models import PageAnalysisResult
from services.analysis_jobs import analysis_jobs

router = APIRouter()


class StartAnalysisJob(BaseModel):
    document_id: str = Field(min_length=1)
    pages: list[int] = Field(min_length=1, max_length=1000)
    force: bool = False


@router.post("/jobs", status_code=202)
def start_analysis_job(request: StartAnalysisJob):
    return analysis_jobs.submit(request.document_id, request.pages, request.force)


@router.get("/jobs")
def list_analysis_jobs():
    return {"jobs": analysis_jobs.list()}


@router.get("/jobs/{job_id}")
def get_analysis_job(job_id: str):
    return analysis_jobs.get(job_id)


@router.get("/jobs/{job_id}/results", response_model=list[PageAnalysisResult])
def get_job_results(job_id: str):
    return analysis_jobs.results(job_id)


@router.post("/jobs/{job_id}/cancel")
def cancel_analysis_job(job_id: str):
    return analysis_jobs.cancel(job_id)
