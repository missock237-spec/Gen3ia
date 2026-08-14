from setuptools import setup, find_packages

setup(
    name="genova-sdk",
    version="1.0.0",
    description="Python SDK for Genova AI Agent Platform",
    packages=find_packages(),
    install_requires=["requests>=2.31.0"],
    python_requires=">=3.8",
)
