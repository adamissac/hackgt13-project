"""Learned match scoring (V2). Trained on handshake outcomes.

Training data (one row per pair that MET, i.e. did a QR handshake or had an encounter):
  X   = pair_features(viewer, other)          -> 9 numbers from scoring.FEATURES
  y   = 1 if BOTH said wants_connect else 0    -> logistic regression target
  rel = 2 connect / 1 long talk / 0 neither    -> LambdaRank graded relevance
  group = viewer id                            -> ranking is per person

Why only pairs that met: you only observe outcomes for people you showed and who talked.
Log impressions (who was shown at what rank) so you can later add inverse-propensity weights.
"""
import pickle
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.metrics import roc_auc_score, ndcg_score
from .scoring import FEATURES, pair_features, v1_score


def build_dataset(rows, people_by_id, index, cluster=None):
    X, y, rel, groups, v1 = [], [], [], [], []
    for r in rows:
        f = pair_features(people_by_id[r["viewer"]], people_by_id[r["other"]], index, cluster)
        X.append([f[k] for k in FEATURES])
        v1.append(v1_score(f))
        y.append(r["y"]); rel.append(r["rel"]); groups.append(r["viewer"])
    return np.array(X), np.array(y), np.array(rel), np.array(groups), np.array(v1)


class LRModel:
    def __init__(self):
        self.pipe = make_pipeline(StandardScaler(), LogisticRegression(C=1.0, class_weight="balanced",
                                                                       max_iter=2000))

    def fit(self, X, y):
        self.pipe.fit(X, y); return self

    def predict_score(self, X):
        return self.pipe.predict_proba(X)[:, 1]

    def coefficients(self):
        lr = self.pipe[-1]
        return dict(sorted(zip(FEATURES, lr.coef_[0].round(3)), key=lambda kv: -abs(kv[1])))


class LGBMRankModel:
    def __init__(self):
        import lightgbm as lgb
        self.m = lgb.LGBMRanker(objective="lambdarank", n_estimators=200, learning_rate=0.05,
                                num_leaves=15, min_child_samples=10, verbose=-1)

    def fit(self, X, rel, groups):
        order = np.argsort(groups, kind="stable")
        X, rel, groups = X[order], rel[order], groups[order]
        _, counts = np.unique(groups, return_counts=True)
        self.m.fit(X, rel, group=counts); return self

    def predict_score(self, X):
        return self.m.predict(X)


def group_split(groups, test_frac=0.25, seed=0):
    rng = np.random.default_rng(seed)
    uniq = np.unique(groups)
    test_ids = set(rng.choice(uniq, size=int(len(uniq) * test_frac), replace=False))
    te = np.array([g in test_ids for g in groups])
    return ~te, te


def mean_ndcg(scores, rel, groups, k=10):
    vals = []
    for g in np.unique(groups):
        m = groups == g
        if m.sum() < 2 or rel[m].max() == 0:
            continue
        vals.append(ndcg_score(rel[m][None, :], scores[m][None, :], k=k))
    return float(np.mean(vals)) if vals else float("nan")


def train_and_evaluate(X, y, rel, groups, v1):
    tr, te = group_split(groups)
    lr = LRModel().fit(X[tr], y[tr])
    lgbm = LGBMRankModel().fit(X[tr], rel[tr], groups[tr])
    report = {
        "n_train_pairs": int(tr.sum()), "n_test_pairs": int(te.sum()), "positive_rate": float(y.mean()),
        "AUC": {"v1_hand_tuned": roc_auc_score(y[te], v1[te]),
                "logistic_regression": roc_auc_score(y[te], lr.predict_score(X[te])),
                "lgbm_lambdarank": roc_auc_score(y[te], lgbm.predict_score(X[te]))},
        "NDCG@10": {"v1_hand_tuned": mean_ndcg(v1[te], rel[te], groups[te]),
                    "logistic_regression": mean_ndcg(lr.predict_score(X[te]), rel[te], groups[te]),
                    "lgbm_lambdarank": mean_ndcg(lgbm.predict_score(X[te]), rel[te], groups[te])},
        "lr_coefficients": lr.coefficients(),
    }
    # refit on everything for serving
    lr_full = LRModel().fit(X, y)
    lgbm_full = LGBMRankModel().fit(X, rel, groups)
    return report, lr_full, lgbm_full


def thompson_scores(lr_model, X, n_boot_models=None, rng=None):
    """Cheap exploration: add noise scaled by prediction uncertainty p(1-p)."""
    rng = rng or np.random.default_rng()
    p = lr_model.predict_score(X)
    return p + rng.normal(0, 1, len(p)) * np.sqrt(p * (1 - p)) * 0.3


def save_model(model, path):
    with open(path, "wb") as f:
        pickle.dump(model, f)


def load_model(path):
    with open(path, "rb") as f:
        return pickle.load(f)
