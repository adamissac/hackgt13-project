"""ML service package.

Native math libraries (PyTorch for embeddings, numba for UMAP, BLAS) each start one thread per CPU the machine
reports. A container that reports many CPUs but is limited to a couple of cores then thrashes when an embed, a
UMAP run and a request overlap, and a seconds-long model rebuild can take many minutes. Cap them before any of
those libraries is imported; a Railway variable with the same name still wins.
"""
import os

for _var in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS", "NUMBA_NUM_THREADS", "VECLIB_MAXIMUM_THREADS"):
    os.environ.setdefault(_var, os.getenv("ML_THREADS", "2"))
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
