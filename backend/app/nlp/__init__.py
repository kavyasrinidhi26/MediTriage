"""
MediTriage AI — NLP Package
Provides modular text processing for multilingual clinical complaints (English, Telugu Script, Telugu Transliteration).
"""

from app.nlp.complaint_processor import (
    process_complaint,
    check_red_flags_from_symptoms,
    LanguageFormat,
    SymptomContext,
    ProcessedComplaint,
    ExtractedSymptomConcept,
)
from app.nlp.symptom_dictionary import SYMPTOM_DICTIONARY, RED_FLAG_CONCEPTS

__all__ = [
    "process_complaint",
    "check_red_flags_from_symptoms",
    "LanguageFormat",
    "SymptomContext",
    "ProcessedComplaint",
    "ExtractedSymptomConcept",
    "SYMPTOM_DICTIONARY",
    "RED_FLAG_CONCEPTS",
]
