# cabal/views/customerorders.py

from django.shortcuts import render
from django.views.decorators.clickjacking import xframe_options_sameorigin


@xframe_options_sameorigin
def CustomerOrders(request):
    template_name = "customerorders/parser_interface.html"
    return render(request, template_name, context={})
