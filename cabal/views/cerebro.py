# /plugins/Cabal/cabal/views/cerebro.py

from django.shortcuts import render
from django.views.decorators.clickjacking import xframe_options_sameorigin


@xframe_options_sameorigin
def Cerebro(request):
    template_name = "cerebro/cerebro.html"
    return render(request, template_name, context={})
