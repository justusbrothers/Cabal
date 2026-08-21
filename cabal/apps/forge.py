# /plugins/Cabal/cabal/apps/forge.py

from django.shortcuts import render
from django.views.decorators.clickjacking import xframe_options_sameorigin


@xframe_options_sameorigin
def Forge(request):
    template_name = "forge/forge.html"
    return render(request, template_name, context={})
